// Reuse isolated existing QA services: no remote Auth, DB, Storage or autosave.
import globals from "./envelope-global.vite.mjs";
import assets from "./envelope-assets.vite.mjs";
export default { ...globals, plugins: [...globals.plugins, assets.plugins[2]] };
