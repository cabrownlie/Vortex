import { IExtensionApi } from '../../types/IExtensionContext';
import Debouncer from '../../util/Debouncer';
import opn from '../../util/opn';
import { activeGameId, gameById } from '../../util/selectors';
import { getSafe } from '../../util/storeHelper';
import { IModTable, IState, StateChangeCallback, IMod } from '../../types/api';

import { retrieveModInfo } from './util/checkModsVersion';
import submitFeedback from './util/submitFeedback';
import * as Promise from 'bluebird';
import Nexus, { IIssue, IFeedbackResponse } from 'nexus-api';
import { nexusGameId, toNXMId } from './util/convertGameId';
import { log } from '../../util/log';
import { DownloadIsHTML } from '../download_management/DownloadManager';
import { showError } from '../../util/message';
import { startDownload, endorseModImpl, checkModVersionsImpl, validateKey } from './util';
import { setApiKey } from '../../util/errorHandling';
import { setUserInfo } from './actions/session';
import { setUpdatingMods } from '../mod_management/actions/settings';


export function onChangeMods(api: IExtensionApi, nexus: Nexus) {
  let lastModTable = api.store.getState().persistent.mods;
  let lastGameMode = activeGameId(api.store.getState());

  const updateDebouncer: Debouncer = new Debouncer(newModTable => {
    const state = api.store.getState();
    const gameMode = activeGameId(state);
    if (lastGameMode === undefined) {
      return;
    }
    if ((lastModTable[lastGameMode] !== newModTable[gameMode])
      && (lastModTable[lastGameMode] !== undefined)
      && (newModTable[gameMode] !== undefined)) {
      Object.keys(newModTable[gameMode]).forEach(modId => {
        const lastPath = [lastGameMode, modId, 'attributes', 'modId'];
        const newPath = [gameMode, modId, 'attributes', 'modId'];
        const lastDLGamePath = [lastGameMode, modId, 'attributes', 'downloadGame'];
        const newDLGamePath = [gameMode, modId, 'attributes', 'downloadGame'];
        if ((getSafe(lastModTable, lastPath, undefined)
              !== getSafe(newModTable, newPath, undefined))
           || (getSafe(lastModTable, lastDLGamePath, undefined)
              !== getSafe(newModTable, newDLGamePath, undefined))) {
          return retrieveModInfo(nexus, api.store,
            gameMode, newModTable[gameMode][modId], api.translate)
            .then(() => {
              lastModTable = newModTable;
              lastGameMode = gameMode;
            });
        }
      });
    } else {
      return Promise.resolve();
    }
  }, 2000);

  return (oldValue: IModTable, newValue: IModTable) =>
      updateDebouncer.schedule(undefined, newValue);
}

export function onOpenModPage(api: IExtensionApi) {
  return (gameId: string, modId: string) => {
    const game = gameById(api.store.getState(), gameId);
    opn(['https://www.nexusmods.com',
      nexusGameId(game), 'mods', modId,
    ].join('/')).catch(err => undefined);
  };
}

export function onChangeNXMAssociation(registerFunc: (def: boolean) => void, api: IExtensionApi): StateChangeCallback {
  return (oldValue: boolean, newValue: boolean) => {
    log('info', 'associate', { oldValue, newValue });
    if (newValue === true) {
      registerFunc(true);
    }
    else {
      api.deregisterProtocol('nxm');
    }
  };
}

export function onRequestOwnIssues(nexus: Nexus) {
  return (cb: (err: Error, issues?: IIssue[]) => void) => {
    nexus.getOwnIssues()
      .then(issues => {
        cb(null, issues);
      })
      .catch(err => cb(err));
  };
}

export function onModUpdate(api: IExtensionApi, nexus: Nexus): (...args: any[]) => void {
  return (gameId, modId, fileId) => {
    const state: IState = api.store.getState();
    if (!getSafe(state, ['persistent', 'nexus', 'userInfo', 'isPremium'], false)
      && !getSafe(state, ['persistent', 'nexus', 'userInfo', 'isSupporter'], false)) {
      // nexusmods can't let users download files directly from client, without
      // showing ads
      opn(['https://www.nexusmods.com', nexusGameId(gameId), 'mods', modId].join('/'))
        .catch(err => undefined);
      return;
    }
    // TODO: Need some way to identify if this request is actually for a nexus mod
    const url = `nxm://${toNXMId(gameId)}/mods/${modId}/files/${fileId}`;
    const downloads = state.persistent.downloads.files;
    // check if the file is already downloaded. If not, download before starting the install
    const existingId = Object.keys(downloads).find(downloadId => getSafe(downloads, [downloadId, 'modInfo', 'nexus', 'ids', 'fileId'], undefined) === fileId);
    if (existingId !== undefined) {
      api.events.emit('start-install-download', existingId);
    }
    else {
      startDownload(api, nexus, url)
        .then(downloadId => {
          api.events.emit('start-install-download', downloadId);
        })
        .catch(DownloadIsHTML, err => undefined)
        .catch(err => {
          api.showErrorNotification('failed to start download', err);
        });
    }
  };
}

export function onSubmitFeedback(nexus: Nexus): (...args: any[]) => void {
  return (title: string, message: string, hash: string, feedbackFiles: string[], anonymous: boolean, callback: (err: Error, respones?: IFeedbackResponse) => void) => {
    submitFeedback(nexus, title, message, feedbackFiles, anonymous, hash)
      .then(response => callback(null, response))
      .catch(err => callback(err));
  };
}

export function onEndorseMod(api: IExtensionApi, nexus: Nexus): (...args: any[]) => void {
  return (gameId, modId, endorsedStatus) => {
    const APIKEY = getSafe(api.store.getState(), ['confidential', 'account', 'nexus', 'APIKey'], '');
    if (APIKEY === '') {
      api.showErrorNotification('An error occurred endorsing a mod', 'You are not logged in to Nexus Mods!', { allowReport: false });
    }
    else {
      endorseModImpl(api, nexus, gameId, modId, endorsedStatus);
    }
  };
}

export function onAPIKeyChanged(api: IExtensionApi, nexus: Nexus): StateChangeCallback {
  return (oldValue: string, newValue: string) => {
    nexus.setKey(newValue);
    setApiKey(newValue);
    api.store.dispatch(setUserInfo(undefined));
    if (newValue !== undefined) {
      validateKey(api, nexus, newValue);
    }
  };
}

export function onCheckModsVersion(api: IExtensionApi, nexus: Nexus): (...args: any[]) => Promise<void> {
  return (gameId, mods) => {
    const APIKEY = getSafe(api.store.getState(), ['confidential', 'account', 'nexus', 'APIKey'], '');
    if (APIKEY === '') {
      api.showErrorNotification('An error occurred checking for mod updates', 'You are not logged in to Nexus Mods!', { allowReport: false });
      return Promise.resolve();
    }
    else {
      api.store.dispatch(setUpdatingMods(gameId, true));
      const start = Date.now();
      return checkModVersionsImpl(api.store, nexus, gameId, mods)
        .then((errorMessages: string[]) => {
          if (errorMessages.length !== 0) {
            showError(api.store.dispatch, 'Some mods could not be checked for updates', errorMessages.join('\n\n'), { allowReport: false });
          }
        })
        .catch(err => {
          showError(api.store.dispatch, 'An error occurred checking for mod updates', err);
        })
        .then(() => Promise.delay(2000 - (Date.now() - start)))
        .finally(() => {
          api.store.dispatch(setUpdatingMods(gameId, false));
        });
    }
  };
}
