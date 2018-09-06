import { IGameStored } from "../../../types/IState";

/**
 * convert the game id from either our internal format or the format
 * used in NXM links to the format used in the nexus api.
 * TODO: This works only as one function because our internal id so
 *   far coincides with the nxm link format except for upper/lower case.
 *   This should be two functions!
 * TODO: Actually, since game support is in extensions, this shouldn't happen
 *   here at all
 */

export function nexusGameId(game: IGameStored): string {
  if (game === undefined) {
    return undefined;
  }

  if ((game.details !== undefined) && (game.details.nexusPageId !== undefined)) {
    return game.details.nexusPageId;
  }

  return {
    skyrimse: 'skyrimspecialedition',
    skyrimvr: 'skyrimspecialedition',
    falloutnv: 'newvegas',
    fallout4vr: 'fallout4',
    teso: 'elderscrollsonline',
  }[game.id.toLowerCase()] || game.id;
}

export function convertGameIdReverse(input: string): string {
  if (input === undefined) {
    return undefined;
  }
  return {
    skyrimspecialedition: 'skyrimse',
    newvegas: 'falloutnv',
    elderscrollsonline: 'teso',
  }[input.toLowerCase()] || input;
}

export function toNXMId(input: string): string {
  const inputL = input.toLowerCase();
  if (inputL === 'skyrimse') {
    return 'SkyrimSE';
  } else if (inputL === 'skyrimvr') {
    return 'SkyrimVR';
  } else if (inputL === 'fallout4vr') {
    return 'fallout4';
  } else {
    return input;
  }
}
