import { app as appIn, remote } from 'electron';
import * as path from 'path';

const app = remote !== undefined ? remote.app : appIn;

export type AppPath = 'base' | 'assets' | 'modules' | 'modules_unpacked'
                    | 'bundledPlugins' | 'locales' | 'package';

/**
 * app.getAppPath() returns the path to the app.asar,
 * development: node_modules\electron\dist\resources\default_app.asar
 * production (with asar): Vortex\resources\app.asar
 * production (without asar): Vortex\resources\app
 */
let basePath = app.getAppPath();
const isDevelopment = path.basename(basePath, '.asar') !== 'app';
const isAsar = !isDevelopment && (path.extname(basePath) === '.asar');
const applicationPath = (isDevelopment)
  ? basePath
  : path.resolve(path.dirname(basePath), '..');

if (isDevelopment) {
  basePath = path.join(applicationPath, 'out');
}

// basePath is now the path that contains assets, bundledPlugins, index.html, main.js and so on
// applicationPath is still different between development and production

function getModulesPath(unpacked: boolean): string {
  if (isDevelopment) {
    return path.join(applicationPath, 'node_modules');
  }
  const asarPath = unpacked && isAsar ? basePath + '.unpacked' : basePath;
  return path.join(asarPath, 'node_modules');
}

function getBundledPluginsPath(): string {
  // bundled plugins are never packed in the asar
  return isAsar
    ? path.join(basePath + '.unpacked', 'bundledPlugins')
    : path.join(basePath, 'bundledPlugins');
}

function getLocalesPath(): string {
  // in production builds the locales are not inside the app(.asar) directory but alongside it
  return isDevelopment
    ? path.join(basePath, 'locales')
    : path.resolve(basePath, '..', 'locales');
}

/**
 * path to the directory containing package.json file
 */
function getPackagePath(): string {
  return isDevelopment
    ? applicationPath
    : basePath;
}

/**
 * the electron getAppPath function and globals like __dirname
 * or process.resourcesPath don't do a great job of abstracting away
 * how the application is being built, e.g. development or not, asar or not,
 * webpack or not, portable or not.
 * This function aims to provide paths to application data independent
 * of any of that.
 */
function getVortexPath(id: AppPath): string {
  switch (id) {
    case 'base': return basePath;
    case 'package': return getPackagePath();
    case 'assets': return path.join(basePath, 'assets');
    case 'modules': return getModulesPath(false);
    case 'modules_unpacked': return getModulesPath(true);
    case 'bundledPlugins': return getBundledPluginsPath();
    case 'locales': return getLocalesPath();
  }
}

export default getVortexPath;
