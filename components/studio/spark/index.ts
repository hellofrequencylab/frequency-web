// The Spark kit (docs/STUDIO.md, ADR-597). Every guided creation flow composes these; none of
// them re-declares a shell, a progress cue, an upload box, or a field style.
//
// Import from here, not from the files directly, so the kit's internals can be reorganized
// without touching a single wizard.

export { SparkShell, type SparkShellProps } from './spark-shell'
export { SparkDoors, type SparkDoor } from './spark-doors'
export { SparkDropzone, type SparkDropzoneProps } from './spark-dropzone'
export { SparkReview, type SparkReviewProps } from './spark-review'
export { SparkSteer, type SparkSteerProps } from './spark-steer'
export { FieldControl, type FieldControlProps, type FieldOptions } from './field/field-control'
