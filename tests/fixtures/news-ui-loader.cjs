// Local test bundler only; no application/runtime dependency.
const ts = require('typescript'); // eslint-disable-line @typescript-eslint/no-require-imports
module.exports = function(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
};
