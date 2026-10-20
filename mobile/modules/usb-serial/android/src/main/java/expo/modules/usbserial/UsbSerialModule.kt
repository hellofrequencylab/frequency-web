package expo.modules.usbserial

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.util.SerialInputOutputManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// USB serial for the CyberUnicorn 5000 (its CH340 USB-UART), over Android USB host (OTG).
//
// THE ONE RULE: the CYD wires the CH340's DTR and RTS to the ESP32's EN and IO0 through the usual
// auto-reset transistors. Asserting RTS holds EN low and resets the board, and a DTR/RTS transition
// glitches it (cyberpunkunicorn-os apps/remote/PROTOCOL.md §2). So this module opens at 115200 8N1,
// sets DTR=false and RTS=false once, and never touches either line again. There is no API to set them.
//
// Bytes cross the bridge as base64 both ways; the JS side owns line framing and UTF-8 decoding.

private const val ACTION_USB_PERMISSION = "com.frequencylocal.experience.USB_PERMISSION"
private const val WRITE_TIMEOUT_MS = 2000

class UsbSerialException(message: String) : CodedException(message)

class UsbSerialModule : Module() {
  private var port: UsbSerialPort? = null
  private var io: SerialInputOutputManager? = null
  private var openDeviceId: Int? = null
  private var detachReceiver: BroadcastReceiver? = null

  private val context: Context
    get() = appContext.reactContext ?: throw UsbSerialException("No Android context")

  private val usbManager: UsbManager
    get() = context.getSystemService(Context.USB_SERVICE) as UsbManager

  private fun drivers(): List<UsbSerialDriver> =
    UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)

  private fun driverFor(deviceId: Int): UsbSerialDriver =
    drivers().firstOrNull { it.device.deviceId == deviceId }
      ?: throw UsbSerialException("That USB device is no longer attached")

  override fun definition() = ModuleDefinition {
    Name("FrequencyUsbSerial")

    Events("onData", "onError", "onDetached")

    AsyncFunction("listDevices") {
      drivers().map { d ->
        val dev = d.device
        mapOf(
          "deviceId" to dev.deviceId,
          "vendorId" to dev.vendorId,
          "productId" to dev.productId,
          "name" to (dev.productName ?: dev.deviceName),
          "manufacturer" to dev.manufacturerName,
          "driver" to d.javaClass.simpleName,
          "hasPermission" to usbManager.hasPermission(dev)
        )
      }
    }

    AsyncFunction("requestPermission") { deviceId: Int, promise: Promise ->
      val device = driverFor(deviceId).device
      if (usbManager.hasPermission(device)) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          if (intent.action != ACTION_USB_PERMISSION) return
          try {
            ctx.unregisterReceiver(this)
          } catch (_: Exception) {
          }
          promise.resolve(intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false))
        }
      }
      registerReceiverCompat(receiver, IntentFilter(ACTION_USB_PERMISSION))
      // Android 14 refuses a mutable PendingIntent around an implicit intent, so name our package.
      val intent = Intent(ACTION_USB_PERMISSION).setPackage(context.packageName)
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
      usbManager.requestPermission(device, PendingIntent.getBroadcast(context, 0, intent, flags))
    }

    AsyncFunction("open") { deviceId: Int, baudRate: Int ->
      closeInternal()
      val driver = driverFor(deviceId)
      val connection = usbManager.openDevice(driver.device)
        ?: throw UsbSerialException("No permission for that USB device")
      val p = driver.ports.firstOrNull() ?: throw UsbSerialException("That device has no serial port")
      p.open(connection)
      p.setParameters(baudRate, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
      // Deassert both lines once (the driver's init already leaves them off). Never toggled after this.
      try {
        p.setDTR(false)
        p.setRTS(false)
      } catch (_: UnsupportedOperationException) {
      }
      port = p
      openDeviceId = deviceId
      val manager = SerialInputOutputManager(p, object : SerialInputOutputManager.Listener {
        override fun onNewData(data: ByteArray) {
          sendEvent("onData", mapOf("base64" to Base64.encodeToString(data, Base64.NO_WRAP)))
        }

        override fun onRunError(e: Exception) {
          sendEvent("onError", mapOf("message" to (e.message ?: "USB read stopped")))
        }
      })
      io = manager
      manager.start()
      watchDetach()
      true
    }

    AsyncFunction("write") { base64: String ->
      val p = port ?: throw UsbSerialException("The USB port is not open")
      p.write(Base64.decode(base64, Base64.NO_WRAP), WRITE_TIMEOUT_MS)
      true
    }

    AsyncFunction("close") {
      closeInternal()
      true
    }

    Function("isOpen") {
      port != null
    }

    OnDestroy {
      closeInternal()
    }
  }

  private fun watchDetach() {
    if (detachReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context, intent: Intent) {
        val device: UsbDevice? = if (Build.VERSION.SDK_INT >= 33) {
          intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
        }
        if (device != null && device.deviceId == openDeviceId) {
          closeInternal()
          sendEvent("onDetached", mapOf("deviceId" to device.deviceId))
        }
      }
    }
    detachReceiver = receiver
    registerReceiverCompat(receiver, IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED))
  }

  private fun registerReceiverCompat(receiver: BroadcastReceiver, filter: IntentFilter) {
    if (Build.VERSION.SDK_INT >= 33) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
  }

  private fun closeInternal() {
    io?.setListener(null)
    io?.stop()
    io = null
    try {
      port?.close()
    } catch (_: Exception) {
    }
    port = null
    openDeviceId = null
    detachReceiver?.let {
      try {
        appContext.reactContext?.unregisterReceiver(it)
      } catch (_: Exception) {
      }
    }
    detachReceiver = null
  }
}
