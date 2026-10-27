// THE THEME PICTURES THAT EXIST. A theme page shows a picture when its key is listed here, and a labeled
// empty slot when it is not. Add the key in the same change that adds public/themes/<id>/<slot>.webp;
// library.test.ts fails when this list and the folder disagree, either way. A file-exists check at render
// time is not used because a serverless render cannot see public/.
export const THEME_ASSETS_READY: ReadonlySet<string> = new Set<string>([])
