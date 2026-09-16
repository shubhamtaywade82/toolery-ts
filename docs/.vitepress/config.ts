import {defineConfig} from 'vitepress';

export default defineConfig({
  title: 'Toolery-TS',
  description: 'Deterministic tool-calling benchmark for LLM endpoints',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      {text: 'Guide', link: '/'},
      {text: 'Benchmark', link: '/benchmark'},
      {text: 'Parity', link: '/parity'},
      {text: 'CLI', link: '/cli'},
      {text: 'GitHub', link: 'https://github.com/shubhamtaywade82/toolery-ts'},
    ],
    sidebar: [
      {
        text: 'Documentation',
        items: [
          {text: 'Overview', link: '/'},
          {text: 'Benchmark methodology', link: '/benchmark'},
          {text: 'Upstream parity', link: '/parity'},
          {text: 'CLI reference', link: '/cli'},
        ],
      },
    ],
    socialLinks: [{icon: 'github', link: 'https://github.com/shubhamtaywade82/toolery-ts'}],
    search: {provider: 'local'},
  },
});
