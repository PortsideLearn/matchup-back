import type { WebSocket } from 'uWebSockets.js'
import { Match, Rating } from '../../../../Interfaces/index'

import { clientServer } from '../../clientSocketServer'

import { DTO } from '../../../../Classes/DTO/DTO'
import { TechnicalCause, TechnicalError } from '../../../../error'

import { CONTROLLERS as CONTROLLERS } from '../../Handlers/dark-side'
import { GAME_MAPS } from '../../../../configs/standoff_maps'

import { SearchEngine } from '../../../../Classes/MatchMaking/Rating/SearchEngine'
import { LobbyManager } from '../../../../Classes/MatchMaking/Lobby/Manager'
import { isCorrectType } from '../../../../Classes/MatchMaking/Lobby/Lobby'
import { TEAMS } from '../../../../Classes/MatchMaking/Team/Manager'
import { PLAYERS } from '../../../../Classes/MatchMaking/MemberManager'
import { isCorrectCommand } from '../../../../Classes/MatchMaking/Command/Command'
import { StandOffController } from '../../../../Classes/MatchMaking/Controllers/StandOff'
import { dtoParser } from '../../../../Classes/DTO/Parser/Parser'
import { DISCORD_ROBOT } from '../../../../app'
import { MatchListModel, UserModel } from '../../../../Models/index'
import { MINUTE_IN_MS } from '../../../../configs/time_constants'
import { MatchModerationRecordModel } from '../../../../Models/Moderation/ModerateMatchs'

export const StandOff_Lobbies = new LobbyManager(
  new StandOffController(),
  DISCORD_ROBOT,
)

setInterval(function () {
  MatchModerationRecordModel.find({})
    .then((records) => {
      for (let record of records) {
        if (!record.moderated) continue
        MatchListModel.findById(record.match)
          .then(async (match) => {
            if (!match) {
              await record.delete()
              throw new TechnicalError('match', TechnicalCause.NOT_EXIST)
            }
            await match.calculateResults()
            let lobby = StandOff_Lobbies.get(match.info.lobby)
            if (!lobby) return
            await lobby.stop()
          })
          .catch((e) => console.log(e))
      }
    })
    .catch((e) => console.log(e))
}, MINUTE_IN_MS * 30)

const Searcher = new SearchEngine(StandOff_Lobbies)

setInterval(async () => {
  for (let lobby of StandOff_Lobbies.lobbies) {
    switch (lobby.status) {
      case 'searching':
        sendSyncIventToLobby(lobby)
        break
      case 'filled':
        sendReadyIventToLobby(lobby)
        break
      case 'voting':
        sendVoteIventToLobby(lobby)
        break
      case 'preparing':
        if (lobby.readyToStart) {
          sendStartIventToLobby(lobby)
          await lobby.start()
        }
        break
    }
  }
}, 1000 * 10)

/**
 * ???????????????????? ?????? ???????????? ??????????.
 * @param params - ["region", "matchType"]
 * 
 * matchType ?????????? ???????? ???????????????????? ????????:
 * 
 * - training
 * - arcade
 * - rating
 * 
 * ?? ???????????? ???????????? ???????????????????? ???????????? ??????????????:
 * ```ts
 * {
 *  lobbyID: string
 *  chatID: string
 * }
 * ```
 * ?????? ?????????????? ???? ???????? ?????????? ?????????? ?????????????????? ???? event chat ?? ??????????????:
 *
 
 * ```json
 * {
 *  "chat":"lobby#xxxx",
 *  "message": 
 *  {
 *    "from": "system or username",
 *    "message": "text of message"
 *  }
 * }
 * ```
 * @category Lobby
 * @event
 */
export async function find_lobby(socket: WebSocket, params: unknown[]) {
  let Filters: Rating.SearchEngine.Filters
  let username = socket.username as string
  let member = await PLAYERS.get(username)
  if (member.lobbyID) {
    let lobby = StandOff_Lobbies.get(member.lobbyID)
    if (lobby) throw new TechnicalError('lobbyID', TechnicalCause.ALREADY_EXIST)
  }

  let region = params[0]
  if (typeof region != 'string' || !isCorrectRegion(region))
    throw new TechnicalError('region', TechnicalCause.INVALID_FORMAT)

  let team = member.teamID ? TEAMS.get(member.teamID) : undefined
  if (team) {
    if (team.captainName != username)
      throw new TechnicalError('team captain', TechnicalCause.REQUIRED)
    Filters = createFilterForTeamSearch(team, region)
  } else Filters = createFiltersForSoloSearch(member, region)

  let type = params[1]
  if (!isCorrectType(type))
    throw new TechnicalError('regime type', TechnicalCause.INVALID)
  Filters.byRegime(type)

  let lobby = await Searcher.findLobby(Filters)
  if (!lobby.region) lobby.region = region

  const dto = new DTO({ lobbyID: lobby.id, chatID: lobby.chat!.id })
  if ((await lobby.join(username)) && team) {
    for (let member of team.members.toArray)
      clientServer
        .control(clientServer.Aliases.get(member.name)!)
        .emit('lobby_join', dto.to.JSON)
  }
  return {
    lobbyID: lobby.id,
    chatID: lobby.chat!.id,
  }
}
CONTROLLERS.set('find_lobby', find_lobby)

/**
 * ???????????????????? ?????? ???????????? ???? ??????????.
 * @category Lobby
 * @event
 */
export async function leave_lobby(socket: WebSocket, params: unknown[]) {
  let username = socket.username as string
  let member = await PLAYERS.get(username)
  if (!member.lobbyID)
    throw new TechnicalError('lobbyID', TechnicalCause.REQUIRED)

  let lobby = StandOff_Lobbies.get(member.lobbyID)
  if (!lobby) {
    member.lobbyID = undefined
    throw new TechnicalError('lobby', TechnicalCause.NOT_EXIST)
  }

  await lobby.leave(username)
  return true
}
CONTROLLERS.set('leave_lobby', leave_lobby)

/**
 * ???????????????????? ?????? ?????????????????????????? ?????????? ?? ??????????.</br>
 *
 * @category Lobby
 * @event
 */
export async function ready(socket: WebSocket, params: unknown[]) {
  let username = socket.username as string
  let member = await PLAYERS.get(username)

  if (!member.lobbyID)
    throw new TechnicalError('lobby', TechnicalCause.REQUIRED)

  let lobby = StandOff_Lobbies.get(member.lobbyID)
  if (!lobby) {
    member.lobbyID = undefined
    throw new TechnicalError('lobby', TechnicalCause.NOT_EXIST)
  }

  lobby.becomeReady(username)
  return true
}
CONTROLLERS.set('get_ready', ready)

/**
 * ???????????????????? ?????? ?????????????????????? ???? ?????????? ??????????(???????????????? ???????????? ??????????????????).</br>
 * @param params - ["map"]
 * - map ?????????? ?????????????????? ????????????????, ?????????????? ?????????? ???????????????? ???? ?????????????????????? get_maps
 *
 * @category Lobby
 * @event
 */
export async function vote(socket: WebSocket, params: unknown[]) {
  let map = params[0]
  if (typeof map != 'string')
    throw new TechnicalError('map', TechnicalCause.INVALID_FORMAT)

  let username = socket.username as string
  let member = await PLAYERS.get(username)

  if (!member.lobbyID)
    throw new TechnicalError('lobby', TechnicalCause.REQUIRED)

  let lobby = StandOff_Lobbies.get(member.lobbyID)
  if (!lobby) {
    member.lobbyID = undefined
    throw new TechnicalError('lobby', TechnicalCause.NOT_EXIST)
  }

  lobby.vote(username, map)
  sendVoteIventToLobby(lobby)
  return true
}
CONTROLLERS.set('vote', vote)

/**
 * ???????????????????? ?????? ?????????????????? ?????????????????? ????????.</br>
 *
 * @category Lobby
 * @event
 */
export async function get_maps(socket: WebSocket, params: unknown[]) {
  return GAME_MAPS
}
CONTROLLERS.set('get_maps', get_maps)

/**
 * ???????????????????? ?????? ?????????? ??????????????.</br>
 * @param params - ["commandType"]
 * - commandType ?????????? ?????????????????? ???????????????? "spectators", "neutrals", "command1", "command2"
 *
 * @category Lobby
 * @event
 */
export async function change_command(socket: WebSocket, params: unknown[]) {
  let command = params[0]
  if (!isCorrectCommand(command))
    throw new TechnicalError('command', TechnicalCause.INVALID_FORMAT)
  let username = socket.username as string
  let member = await PLAYERS.get(username)

  if (!member.lobbyID)
    throw new TechnicalError('lobby', TechnicalCause.REQUIRED)

  let lobby = StandOff_Lobbies.get(member.lobbyID)
  if (!lobby) {
    member.lobbyID = undefined
    throw new TechnicalError('lobby', TechnicalCause.NOT_EXIST)
  }

  if (!(await lobby.move(username, command)))
    throw new TechnicalError('member command', TechnicalCause.CAN_NOT_UPDATE)
  return true
}
CONTROLLERS.set('change_command', change_command)

/**
 * ???????????????????? ?????? ?????????????????? ???????????????? ???????????????? ??????????????.</br>
 * @returns ?????? ???????????????? ?????????????? ????????????
 * @category Lobby
 * @event
 */
export async function get_captain(socket: WebSocket, params: unknown[]) {
  let username = socket.username as string
  let member = await PLAYERS.get(username)

  if (!member.lobbyID)
    throw new TechnicalError('command', TechnicalCause.REQUIRED)

  let lobby = StandOff_Lobbies.get(member.lobbyID)
  if (!lobby) {
    member.lobbyID = undefined
    throw new TechnicalError('lobby', TechnicalCause.INVALID)
  }

  return {
    command1: lobby.firstCommand.captain,
    command2: lobby.secondCommand.captain,
  }
}
CONTROLLERS.set('get_captain', get_captain)

/**
 * ???????????????????? ?????? ?????????????????????? ???????????? ?? ??????????.
 * @param params - ["userNameToInvite"]
 *
 * ?? ???????????? ???????????? ???????????????????? ???????????????????? ???????????????????????? ?????????? invite  ?? ?????????????? ???????????????????? ????????:
 * ```ts
 * {
 *  label: "lobby"
 *  lobbyID: string
 * }
 * ```
 * ?? ???????????????????? ???????????????????????? ???????????????????? ?????? ???? ?????????? ?? ??????????????:
 * ```ts
 * {
 *  status: true
 * }
 * ```
 *
 * @category Lobby
 * @event
 */
export async function invite_to_lobby(socket: WebSocket, params: unknown[]) {
  let username = socket.username as string
  let member = await PLAYERS.get(username)

  if (!member.lobbyID)
    throw new TechnicalError('lobby', TechnicalCause.REQUIRED)

  let lobby = StandOff_Lobbies.get(member.lobbyID)
  if (!lobby) {
    member.lobbyID = undefined
    throw new TechnicalError('lobby', TechnicalCause.INVALID)
  }

  let invitedUser = params[0]
  if (!invitedUser)
    throw new TechnicalError('username', TechnicalCause.REQUIRED)
  if (typeof invitedUser != 'string')
    throw new TechnicalError('username', TechnicalCause.INVALID_FORMAT)

  let sockets = clientServer.Aliases.get(invitedUser)
  if (!sockets)
    throw new TechnicalError('invited user', TechnicalCause.REQUIRED)

  UserModel.findByName(invitedUser).then((user) => {
    if (!user) return
    user.notify(`?????? ???????????????????? ?? ?????????? ${username}`)
  })

  const invite = new DTO({ label: 'lobby', lobbyID: lobby.id })
  clientServer.control(sockets).emit('invite', invite.to.JSON)
  return true
}
CONTROLLERS.set('invite_to_lobby', invite_to_lobby)

/**
 * ???????????????????? ?????? ???????????????????? ?? ?????????? ???? ID.
 * @param params - ["myLobbyID"]
 * ?? ???????????? ???????????? ???????????????????? ???????????? ??????????????:
 *
 * ```ts
 * {
 *  status: 'searching' | 'filled' | 'started',
 *  players: Array<Member>,
 * }
 * ```
 * @category Lobby
 * @event
 */
export async function join_to_lobby(socket: WebSocket, params: unknown[]) {
  let lobbyID = params[0]
  if (!lobbyID) throw new TechnicalError('lobbyID', TechnicalCause.REQUIRED)
  if (typeof lobbyID != 'string')
    throw new TechnicalError('lobbyID', TechnicalCause.INVALID_FORMAT)

  let lobby = StandOff_Lobbies.get(lobbyID)
  if (!lobby) throw new TechnicalError('lobbyID', TechnicalCause.NOT_EXIST)

  if (!(await lobby.join(socket.username))) return
  return {
    status: lobby.status,
    players: lobby.players,
  }
}
CONTROLLERS.set('join_to_lobby', join_to_lobby)

/**
 * ???????????????????? ?????? ???????????? ?????????????????????????? ???????????????????????? ?? ??????????.</br>
 * ?? ???????????? ???????????? ???????????????????? ???????????? ??????????????:
 *
 * ```ts
 * {
 *  status: 'searching' | 'filled' | 'started',
 *  players: Array<Member>,
 * }
 * ```
 * @category Lobby
 * @event
 */
export async function sync_lobby(socket: WebSocket, params: unknown[]) {
  let username = socket.username as string
  let member = await PLAYERS.get(username)

  if (!member.lobbyID)
    throw new TechnicalError('lobby', TechnicalCause.REQUIRED)

  let lobby = StandOff_Lobbies.get(member.lobbyID)
  if (!lobby) {
    member.lobbyID = undefined
    throw new TechnicalError('lobby', TechnicalCause.NOT_EXIST)
  }

  for (let member of lobby.members.toArray) {
    clientServer.control(clientServer.Aliases.get(member.name)!).emit(
      'sync_lobby',
      dtoParser.from.Object({
        label: 'join',
        status: lobby.status,
        players: lobby.players,
      }).to.JSON,
    )
  }
  return {
    status: lobby.status,
    players: lobby.players,
  }
}
CONTROLLERS.set('sync_lobby', sync_lobby)

/**
 * ???????????????????? ?????? ?????????????????? ???????????????????? ??????????????, ?????????????????????? ?? ??????????.</br>
 * @param params - ["myLobbyID"]
 *
 * ?? ???????????? ???????????? ???????????????????? ???????????????????? ?????????????? ?? ??????????
 * @category Lobby
 * @event
 */
export async function get_lobby_players_count(
  socket: WebSocket,
  params: unknown[],
) {
  let lobbyID = params[0]
  if (!lobbyID) throw new TechnicalError('lobbyID', TechnicalCause.REQUIRED)
  if (typeof lobbyID != 'string')
    throw new TechnicalError('lobbyID', TechnicalCause.INVALID_FORMAT)

  let lobby = StandOff_Lobbies.get(lobbyID)
  if (!lobby) throw new TechnicalError('lobby', TechnicalCause.NOT_EXIST)

  return lobby.playersCount
}
CONTROLLERS.set('get_lobby_players_count', get_lobby_players_count)

/**
 * ???????????????????? ?????? ?????????????????? ???????????????? ???????????????????? ??????????.</br>
 *
 * ?? ???????????? ???????????? ???????????????????? ???????????????????? ?????????????? ??????????
 * @category Lobby
 * @event
 */
export async function get_lobby_count(socket: WebSocket, params: unknown[]) {
  return StandOff_Lobbies.lobbies.length
}
CONTROLLERS.set('get_lobby_count', get_lobby_count)

export async function get_global_players_count(
  socket: WebSocket,
  params: unknown[],
) {
  return StandOff_Lobbies.counter
}
CONTROLLERS.set('get_global_players_count', get_global_players_count)

function isCorrectRegion(
  region: string,
): region is Rating.SearchEngine.SUPPORTED_REGIONS {
  if (region == 'Europe') return true
  if (region == 'Asia') return true
  return false
}

function createFilterForTeamSearch(
  team: Match.Member.Team.Instance,
  region: Rating.SearchEngine.SUPPORTED_REGIONS,
) {
  const Filters = Searcher.Filters
  Filters.byRegion(region)
  Filters.byGRI(team.GRI)
  Filters.byTeam(team.id)
  if (team.isGuild) Filters.byGuild()

  return Filters
}

function createFiltersForSoloSearch(
  member: Match.Member.Instance,
  region: Rating.SearchEngine.SUPPORTED_REGIONS,
) {
  const Filters = Searcher.Filters
  Filters.byRegion(region)
  Filters.byGRI(member.GRI)

  return Filters
}

function sendSyncIventToLobby(lobby: Match.Lobby.Instance) {
  const dto = new DTO({
    label: 'sync',
    lobby: lobby.id,
    status: lobby.status,
    players: lobby.players,
  })
  lobby.chat.send('lobby', dto)
}

function sendReadyIventToLobby(lobby: Match.Lobby.Instance) {
  const dto = new DTO({
    label: 'ready',
    lobby: lobby.id,
    players: lobby.players,
  })
  lobby.chat.send('lobby', dto)
}

function sendVoteIventToLobby(lobby: Match.Lobby.Instance) {
  let captains = {
    command1: lobby.firstCommand.captain,
    command2: lobby.secondCommand.captain,
  }

  const dto = new DTO({
    label: 'vote',
    captains,
    maps: GAME_MAPS,
    votes: lobby.votes,
  })
  lobby.chat.send('lobby', dto)
}

function sendStartIventToLobby(lobby: Match.Lobby.Instance) {
  const dto = new DTO({
    label: 'start',
  })
  lobby.chat.send('lobby', dto)
}
