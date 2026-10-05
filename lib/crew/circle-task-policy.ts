// Circle-task economy policy (SCAN-687). Pure constants, safe for client
// components: the 'use server' actions file may only export async functions,
// and lib/crew/circle-tasks.ts pulls in the admin client.
//
// Any member can draft a circle and become its Host, so a Host is NOT a trusted
// economy actor. createCircleTask clamps the Zap value to this cap and forces
// requires_verification on, so every circle completion is held until community
// ops releases it (app/(main)/admin/actions.ts approveVerification).

/** Most Zaps a circle task may pay. */
export const CIRCLE_TASK_ZAPS_CAP = 100
