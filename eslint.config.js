import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig(
  globalIgnores([
    "node_modules/",
    "dist/",
    "esbuild.config.js",
    "eslint.config.js",
    "*.json",
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
      },
    },
  },
  // Common js and ts lint rules are included in the obsidian provided configs.
  ...obsidianmd.configs.recommended,
  {
    rules: {
      "eslint-comments/no-unlimited-disable": "off",
      "eslint-comments/require-description": "off",
      "eslint-comments/no-restricted-disable": "off",
    },
  },
);
