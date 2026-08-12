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

// The two review-step OFFERS (ADR-993, ADR-995): a cover Vera can draw, and a second read before
// it goes out. `SparkReview` renders them itself; a wizard that keeps a bespoke review step renders
// `SparkOffers` directly rather than hand-rolling either card. The hooks carry the whole contract
// (availability, the Loom filing, the AI label, and the fact that neither may block finishing).
export {
  SparkOffers,
  type SparkOffersProps,
  type SparkCoverOffer,
  type SparkQualityCheck,
} from './spark-offers'
export {
  useCoverOffer,
  useQualityCheck,
  fieldModelText,
  draftText,
  type UseCoverOfferInput,
  type CoverOfferState,
  type UseQualityCheckInput,
  type QualityCheckState,
} from './use-spark-offers'
export { FieldControl, type FieldControlProps, type FieldOptions } from './field/field-control'

// Autosave (ADR-991). The shell already runs this; these are exported for the two things a surface
// outside the stage may legitimately need: naming its own draft scope, and discarding a draft after
// a commit that does NOT leave the Spark (the shell handles the ones that navigate).
export { draftScope, DRAFT_TTL_MS, type SparkDraft } from './draft/draft-store'
export { clearSparkDraft } from './draft/use-spark-draft'

// The label row a field sits in. Re-exported so a consumer never has to reach across into
// components/studio/kit to render a Spark field, which is how bespoke <label> markup creeps back in
// (STUDIO.md §2: no hand-rolled label rows).
export { StudioField, StudioNote } from '../kit/studio-field'
