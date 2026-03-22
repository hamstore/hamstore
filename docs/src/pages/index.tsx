/* eslint-disable max-lines */
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { JSX } from 'react';
import { BsStars } from 'react-icons/bs';
import {
  FaRegCopy,
  FaGithub,
  FaPuzzlePiece,
  FaHandHoldingHeart,
} from 'react-icons/fa';
import { MdOutlineImportContacts } from 'react-icons/md';
import { SlSpeech } from 'react-icons/sl';

type Link = { id: string; label: JSX.Element; to: string };

const links: Link[] = [
  {
    id: 'docs',
    label: (
      <div className="flex items-center gap-2">
        <MdOutlineImportContacts className="text-lg" /> Docs
      </div>
    ),
    to: './docs/installation',
  },
  {
    id: 'github',
    label: (
      <div className="flex items-center gap-2">
        <FaGithub className="text-lg" /> GitHub
      </div>
    ),
    to: 'https://github.com/hamstore/hamstore',
  },
  {
    id: 'examples',
    label: (
      <div className="flex items-center gap-2">
        <FaRegCopy className="text-lg" /> Examples
      </div>
    ),
    to: 'https://github.com/hamstore/hamstore/tree/main/demo/blueprint/src',
  },
  {
    id: 'contact',
    label: (
      <div className="flex items-center gap-2">
        <SlSpeech className="text-lg" /> Contact
      </div>
    ),
    to: 'mailto:it+hamstore@geostrategists.de',
  },
];

const footerLinks = [
  {
    label: 'Geostrategists',
    to: 'https://www.geostrategists.de/',
  },
  {
    label: 'GitHub',
    to: 'https://github.com/hamstore/hamstore',
  },
];

const Home = (): JSX.Element => {
  const logoUrl = useBaseUrl('/img/logo.svg');

  return (
    <>
      <Head>
        <title>Hamstore | Event sourcing made easy</title>
        <meta
          name="description"
          content="Hamstore is a TypeScript library that makes Event Sourcing easy, a powerful paradigm that saves changes to your application state rather than the state itself."
        />
      </Head>
      <div className="flex flex-col gap-12 md:gap-16">
        <div className="flex flex-wrap py-2 px-4 items-center justify-center text-sm max-w-screen-xl mx-auto md:text-base md:self-end">
          {links.map(({ id, label, to }) => {
            const children = (
              <div className="p-2 opacity-90 hover:opacity-100">{label}</div>
            );

            return (
              <div key={id} className="hover:underline">
                {to.startsWith('http') || to.startsWith('mailto') ? (
                  <a href={to}>{children}</a>
                ) : (
                  <Link to={to}>{children}</Link>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <div className="flex gap-2 lg:gap-4 items-center">
            <div className="w-[40px] md:w-[60px] lg:w-[100px]">
              <img
                src={logoUrl}
                alt="Hamstore Logo"
                className="w-full h-auto"
              />
            </div>
            <h1 className="inline-block font-black text-4xl md:text-6xl lg:text-7xl">
              <span className="inline-block text-transparent bg-clip-text bg-gradient-to-l bg-color-gradient">
                Hamstore
              </span>
            </h1>
          </div>
          <h2 className="font-regular text-2xl max-w-md md:text-3xl lg:text-5xl lg:max-w-2xl">
            <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r bg-color-gradient">
              Event sourcing
            </span>{' '}
            made easy
          </h2>
          <p className="text opacity-90 max-w-[500px] lg:text-xl lg:max-w-[600px]">
            <a href="https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing">
              Event Sourcing
            </a>{' '}
            is a data storage paradigm that saves{' '}
            <strong>changes in your application state</strong> rather than the
            state itself.
          </p>
          <p className="text opacity-90 max-w-[500px] lg:text-xl lg:max-w-[600px]">
            It is powerful as it enables{' '}
            <strong>rewinding to a previous state</strong> and{' '}
            <strong>exploring audit trails</strong> for debugging or
            business/legal purposes. It also integrates very well with{' '}
            <a href="https://en.wikipedia.org/wiki/Event-driven_architecture">
              event-driven architectures
            </a>
            .
          </p>
          <p className="text opacity-90 max-w-[500px] lg:text-xl lg:max-w-[600px]">
            However, it is <strong>tricky to implement</strong> 😅
          </p>
          <p className="text opacity-90 max-w-[500px] lg:text-xl lg:max-w-[600px]">
            ...well, <strong>not anymore</strong> 💪
          </p>
          <Link
            to="./docs/installation"
            className="py-2 px-4 bg-gradient-to-r bg-color-gradient rounded text-white uppercase font-extrabold"
          >
            👉 Get Started
          </Link>
        </div>
        <div className="text-lg flex flex-col gap-12 p-8 max-w-[1200px] mx-auto md:flex-row">
          <div className="flex-1 flex flex-col gap-8 items-center max-w-[400px]">
            <BsStars className="text-primary-light text-6xl" />
            <div className="flex flex-col gap-1 text-center">
              <h3 className="uppercase text-xl font-black">Stack Agnostic</h3>
              <p className="text-sm dark:text-gray-200 leading-6">
                Hamstore is in <strong>TypeScript</strong>. Outside from that,
                it can be used pretty much <strong>anywhere</strong>: Web apps,
                containers, Lambdas... you name it 🙌
              </p>
              <p className="text-sm dark:text-gray-200 leading-6">
                For instance, <code>EventStore</code> classes are{' '}
                <strong>stack agnostic</strong>: They need an{' '}
                <code>EventStorageAdapter</code> class to interact with actual
                data.
              </p>
              <p className="text-sm dark:text-gray-200 leading-6">
                You can code your own <code>EventStorageAdapter</code> (simply
                implement the interface), but it's much simpler to use
                off-the-shelf adapters like the{' '}
                <a href="https://www.npmjs.com/package/@hamstore/event-storage-adapter-dynamodb">
                  DynamoDBEventStorageAdapter
                </a>
                .
              </p>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-8 items-center max-w-[400px]">
            <FaPuzzlePiece className="text-primary-lightest text-6xl" />
            <div className="flex flex-col gap-1 text-center">
              <h3 className="uppercase text-center text-xl font-black">
                Modular & Type-safe
              </h3>
              <p className="text-sm dark:text-gray-200 leading-6">
                Hamstore is a{' '}
                <strong>collection of utility classes and helpers</strong>, but
                NOT a framework: While some classes require compatible
                infrastructure, Hamstore is not responsible for deploying it.
              </p>
              <p className="text-sm dark:text-gray-200 leading-6">
                Though that is not something we exclude in the future, we are a
                small team and decided to focus on DevX first.
              </p>
              <p className="text-sm dark:text-gray-200 leading-6">
                Speaking of DevX, we absolutely love TypeScript! If you do too,
                you're in the right place: We{' '}
                <strong>push type-safety to the limit</strong> in everything we
                do!
              </p>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-8 items-center max-w-[400px]">
            <FaHandHoldingHeart className="text-primary-lighter text-6xl" />
            <div className="flex flex-col gap-1 text-center">
              <h3 className="uppercase text-center text-xl font-black">
                Comprehensive
              </h3>
              <p className="text-sm dark:text-gray-200 leading-6">
                The Event Sourcing journey has many hidden pitfalls.{' '}
                <strong>We ran into them for you</strong>!
              </p>
              <p className="text-sm dark:text-gray-200 leading-6">
                Hamstore is opinionated. It comes with a collection of best
                practices and documented anti-patterns that we hope will help
                you out!
              </p>
              <p className="text-sm dark:text-gray-200 leading-6">
                It also comes with an awesome collection of packages that will
                make your life easy, e.g. when working on{' '}
                <a href="https://www.npmjs.com/package/@hamstore/lib-test-tools">
                  unit tests
                </a>
                ,{' '}
                <a href="https://www.npmjs.com/package/@hamstore/lib-dam">
                  data migration
                </a>{' '}
                or{' '}
                <a href="https://www.npmjs.com/package/@hamstore/lib-react-visualizer">
                  data modelling
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="navbar navbar--dark flex flex-col items-start justify-center py-10 text-sm shadow-xl shadow-black/10">
        <div className="full-width">
          <div className="flex justify-around md:justify-center gap-3">
            {footerLinks.map(item => (
              <div key={item.to} className="text-center">
                {item.to.startsWith('http') ? (
                  <a href={item.to} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                ) : (
                  <Link to={item.to}>{item.label}</Link>
                )}
              </div>
            ))}
          </div>
          <div className="text-center opacity-20 mt-2">
            &copy; 2022-2025 Serverless by Theodo, {new Date().getFullYear()}{' '}
            Geostrategists
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
