import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: { printWidth: 120, ignorePatterns: ["packages/pagesight/CHANGELOG.md"] },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    categories: { correctness: "error" },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "typescript/no-base-to-string": "warn",
      "typescript/restrict-template-expressions": "warn",
    },
    options: { typeAware: true, typeCheck: true },
  },
  staged: { "*": "vp check --fix" },
});
