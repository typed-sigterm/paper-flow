export default defineNuxtConfig({
  compatibilityDate: '2026-06-02',

  modules: ['@nuxt/ui'],

  ssr: false,

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'PaperFlow',
    },
  },

  css: [
    '~/app.css',
    'katex/dist/katex.min.css',
  ],

  runtimeConfig: {
    nitro: {
      envPrefix: 'PF_',
    },
    dataDir: '.data',
    qcloudSecretId: '',
    qcloudSecretKey: '',
    qcloudTokenhubBaseUrl: 'https://tokenhub.tencentmaas.com/v1',
    qcloudTokenhubApiKey: '',
    fixTextModel: 'deepseek-v4-flash',
    redrawFigureModel: 'hy-image-lite',
  },

  vite: {
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'docx',
        'unpdf',
        'katex',
        'markdown-exit',
      ],
    },
  },

  nitro: {
    preset: 'node-server',
    esbuild: {
      options: {
        target: 'es2024',
      },
    },
  },

  fonts: {
    provider: 'bunny',
    providers: {
      google: false,
      googleicons: false,
    },
  },

  icon: {
    mode: 'svg',
    clientBundle: {
      scan: true,
    },
  },
});
