---
title: Send Space email from your own domain
description: Set up a sender on your own domain for your Space's conversations or campaigns, what DNS records to add, and what happens to replies.
category: spaces
order: 8
published: 2026-10-12
updated: 2026-10-12
audience: member
featureKeys: [space-email]
status: published
---

Your Space already sends email in its own name through Frequency. On Business, Non Profit or
Collective, it can send from an address on your own domain instead, like `hello@yourname.com`.

## Before you start

- **You need to be the Space owner.** The setup only shows for the owner.
- **Your plan needs to include it.** Business, Non Profit and Collective do. On another plan you see
  a link to your Space plans instead.
- **Connect your domain to your Space first.** Do that in the **Your website** card under **Manage**,
  then **Profile & Settings**. See [Your website](/help/spaces/your-website). You can then send from
  that domain or from a subdomain of it.

## Set up your sender

Open **Email** from Manage. The setup is in the **Sender identity** section.

1. **Prepare the domain.** Enter it under **Email domain** and select **Prepare domain**.
2. **Prove you own it.** Add the TXT record shown at your domain provider. Its name is
   `_frequency-email.yourname.com`, and its value is one record holding the quoted pieces shown.
   Then select **Check ownership and connect**. Connecting your website domain does not count for
   email; this record is its own step.
3. **Add the sending records.** A list of DNS records appears. Add each one exactly as shown.
4. **Check the records.** Select **Check sending records**. When it says **Verified**, you are ready.
5. **Choose your sender.** Fill in **Address name** (the part before the @, like `hello`) and
   **Sender name** (what people see in their inbox).
6. **Pick what it sends.** Under **Use this sender for**, choose **Individual conversations** or
   **Campaigns**, then select **Use this sender**. Set them up one at a time if you want your own
   address on both.

New messages of that type now go out from your address. Anything already waiting to send keeps the
sender it had.

## If DNS is slow

DNS changes can take a while to show up. That is fine. The ownership record stays the same for your
setup, so you never need to edit it again. Leave it in place and check again later. The same goes
for the sending records: keep them and select **Check sending records** again.

## Your existing mailbox

Leave your mailbox MX records exactly as they are. If you get email at your domain through Google
Workspace, Microsoft 365 or anyone else, that keeps working. Setting up a sender on Frequency only
adds records for sending.

## Replies

Replies still come back to your Space, not to a separate inbox. A reply to a conversation threads
into that conversation on Frequency, the same as before you set up your domain.

## Switch back

Select **Use Frequency sender** to send that type of message through Frequency again. Replies to
anything you already sent still find their way back.

## If your plan changes or your domain stops verifying

We never quietly swap your address. If your plan no longer includes your own domain, or your domain
stops verifying, sends from that sender are held. Nothing goes out, and you see a message saying why.
Fix the plan or the records, or select **Use Frequency sender** to keep sending in the meantime.
