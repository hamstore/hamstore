// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion
import { themes as prismThemes } from 'prism-react-renderer';

prismThemes.vsLight.plain.backgroundColor = '#f8f8f8';
prismThemes.vsDark.plain.backgroundColor = '#242424';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Hamstore',
  tagline: 'Making Event Sourcing easy 😎',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://hamstore.github.io/',

  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/hamstore/',
  trailingSlash: true,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'hamstore', // Usually your GitHub org/user name.
  projectName: 'hamstore', // Usually your repo name.

  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  headTags: [
    {
      tagName: 'meta',
      attributes: {
        name: 'algolia-site-verification',
        content: '9BBB36145B2F40DB',
      },
    },
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: new URL('./sidebars.js', import.meta.url).pathname,
        },
        theme: {
          customCss: new URL('./src/css/custom.css', import.meta.url).pathname,
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/hamstore-social-card.png',
      navbar: {
        hideOnScroll: true,
        style: 'dark',
        title: 'Hamstore',
        logo: {
          alt: 'Hamstore Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Docs',
          },
          { to: '/visualizer', label: 'Visualizer', position: 'left' },
          {
            href: 'https://github.com/hamstore/hamstore',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      prism: {
        theme: prismThemes.vsLight,
        darkTheme: prismThemes.vsDark,
      },
      algolia: {
        // The application ID provided by Algolia
        appId: 'FXNI0I5TUQ',
        // Public API key: it is safe to commit it
        apiKey: 'ab017a8666c8f43cf5c47996bca1aad3',
        indexName: 'hamstore',
        searchPagePath: 'search',
      },
    }),
};

export default config;
