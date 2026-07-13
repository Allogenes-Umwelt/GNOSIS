// ESLint flat config — SIN build step. Lintea el JS vanilla de navegador de
// static/*.js buscando ERRORES DE CORRECTITUD (typos de variable, redeclaraciones,
// llaves duplicadas, código muerto), NO estilo: el JS del repo tiene un estilo
// deliberado (IIFE, comentarios densos del lenguaje visual PANOPTES) que un
// formateador destruiría. Correr con:  npx eslint static
// El pipelegado no tiene JS; los assets de terceros y vendored quedan fuera.
export default [
  {
    files: ["static/**/*.js"],
    ignores: ["static/**/*.min.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script", // IIFE clásico, no módulos ES
      globals: {
        // navegador
        window: "readonly", document: "readonly", navigator: "readonly",
        location: "readonly", history: "readonly", console: "readonly",
        fetch: "readonly", matchMedia: "readonly", getComputedStyle: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly",
        CustomEvent: "readonly", Event: "readonly", URL: "readonly",
        URLSearchParams: "readonly", Blob: "readonly", FormData: "readonly",
        Image: "readonly", devicePixelRatio: "readonly",
        localStorage: "readonly", sessionStorage: "readonly",
        performance: "readonly", alert: "readonly", confirm: "readonly",
        // del propio proyecto (exportados por un módulo a window)
        Fuerzas: "readonly",
      },
    },
    rules: {
      // correctitud (errores reales), no estilo:
      "no-undef": "error",
      "no-redeclare": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-func-assign": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "no-cond-assign": ["error", "except-parens"],
      "no-constant-condition": ["error", { checkLoops: false }],
      "valid-typeof": "error",
      "use-isnan": "error",
      "no-self-assign": "error",
      "no-unsafe-negation": "error",
      // higiene del estándar (Parte A "Do Not"): sin debugger/console.log colados
      "no-debugger": "error",
      "no-unused-vars": ["warn", { args: "none" }],
    },
  },
];
