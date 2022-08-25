import { clientServer } from '../clientSocketServer'
import { WS_SERVER } from '../../../app'
import type { IDataEscort } from 'gamesocket.io'
import {
  matchCause,
  MatchError,
  MatchUpError,
  validationCause,
  ValidationError,
} from '../../../error'
import { WebSocketValidatior } from '../../../validation'

import * as MatchMaking from '../../../Classes/MatchMaking'
import { ChatManager } from '../../../app'
import { UNDEFINED_MEMBER } from '../../../configs/match_manager'
import { User, UserModel } from '../../../Models/index'

let wsValidator = new WebSocketValidatior(WS_SERVER)
let MemberList = MatchMaking.MemberList

let Teams = new MatchMaking.TeamManager()

let StandOffLobbies = new MatchMaking.LobbyManager(
  new MatchMaking.StandOffController(),
)

let LobbyChatManager = new ChatManager()

/**
 * Событие для создания матча со стороны клиента.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  member: {
 *    name: string
 *    teamID?: number
 *  }
 * }
 * ```
 *
 * В случае успеха создает одноименный ивент и отправляет на него JSON объект:
 * ```ts
 * {
 *  lobby_id: string
 *  chat_id: string
 * }
 * ```
 * Все события из чата матча будут приходить на event lobby_chat в формате:
 *
 * ```json
 * {
 *  "chat_id": "xxxxxx",
 *  "message":
 *  {
 *    "from": "system or username",
 *    "message": "text of message"
 *  }
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function create_match(escort: IDataEscort) {
  try {
    let socketID = escort.get('socket_id') as string
    wsValidator.validateSocket(socketID)

    let lobby = StandOffLobbies.spawn()

    let member = escort.get('member')
    if (!member) throw new ValidationError('member', validationCause.REQUIRED)
    if (typeof member == 'string') {
      await lobby.addMember({
        name: member,
        command: 'neutral',
        readyFlag: false,
      })
      let newChatInstance = LobbyChatManager.spawn('gamesocket.io', {
        namespace: process.env.CLIENT_NAMESPACE!,
        room: lobby.id,
      })
      await newChatInstance.addMember({ name: member, role: 'user' })
      await newChatInstance.send(
        JSON.stringify({
          from: 'system',
          message: `${member} вошел в лобби.`,
        }),
      )
      lobby.chat = newChatInstance

      clientServer.control(socketID).emit('create_match', {
        lobby_id: lobby.id,
        chat_id: newChatInstance.id,
      })
    }
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('create_match error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('create_match error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('create_match error', { reason: 'unknown error' })
    }
  }
}

/**
 * Событие для поиска матча со стороны клиента.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  member: Member
 * }
 * ```
 *
 * В случае успеха создает одноименный ивент и отправляет на него JSON объект:
 * ```ts
 * {
 *  lobby_id: string
 *  chat_id: string
 * }
 * ```
 * Все события из чата матча будут приходить на event lobby_chat в формате:
 *
 
 * ```json
 * {
 *  "chat_id": "xxxxxx",
 *  "message": 
 *  {
 *    "from": "system or username",
 *    "message": "text of message"
 *  }
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function find_match(escort: IDataEscort) {
  try {
    let socketID = escort.get('socket_id') as string
    wsValidator.validateSocket(socketID)

    let lobby = StandOffLobbies.getFreeLobby()
    if (!lobby.chat) {
      let newChatInstance = LobbyChatManager.spawn('gamesocket.io', {
        namespace: process.env.CLIENT_NAMESPACE!,
        room: lobby.id,
      })
      for (let member of lobby.members.members) {
        if (member != UNDEFINED_MEMBER) {
          newChatInstance.addMember({ name: member!.name, role: 'user' })
          await newChatInstance.send(
            JSON.stringify({
              from: 'system',
              message: `${member!.name} вошел в лобби.`,
            }),
          )
        }
      }
      lobby.chat = newChatInstance
    }

    let member = escort.get('member')
    if (!member) throw new ValidationError('member', validationCause.REQUIRED)
    if (!MemberList.isMember(member))
      throw new ValidationError('member', validationCause.INVALID_FORMAT)

    await lobby.addMember(member)
    await lobby.chat.addMember({ name: member.name, role: 'user' })
    await lobby.chat.send(
      JSON.stringify({
        from: 'system',
        message: `${member.name} вошел в лобби.`,
      }),
    )

    clientServer
      .control(socketID)
      .emit('find_match', { lobby_id: lobby.id, chat_id: lobby.chat.id })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('find_match error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('find_match error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('find_match error', { reason: 'unknown error' })
    }
  }
}

/**
 * Событие для ручной синхронизации пользователя с лобби.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  lobby_id: string //строка с id существующего лобби
 * }
 * ```
 *
 * В случае успеха создает одноименный ивент и отправляет на него JSON объект:
 *
 * ```ts
 * {
 *  status: 'searching' | 'filled' | 'started',
 *  players: Array<Member>,
 *  spectators: Array<Member>
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function sync_lobby(escort: IDataEscort) {
  try {
    let socketID = escort.get('socket_id') as string
    wsValidator.validateSocket(socketID)

    let lobbyID = escort.get('lobby_id')

    if (typeof lobbyID != 'string')
      throw new ValidationError('lobby', validationCause.REQUIRED)

    let lobby = StandOffLobbies.get(lobbyID)
    if (!lobby) throw new ValidationError('lobby', validationCause.NOT_EXIST)

    clientServer.control(socketID).emit('sync_lobby', {
      status: lobby.status as string,
      players: JSON.stringify(lobby.members.players),
      spectators: JSON.stringify(lobby.members.spectators),
    })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('sync_lobby error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('sync_lobby error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('sync_lobby error', { reason: 'unknown error' })
    }
  }
}

/**
 * Событие для добавления пользователя в лобби.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  lobby_id: string, //строка с id существующего лобби
 *  member: Member
 * }
 * ```
 *
 * В случае успеха создает ивент sync_lobby и отправляет на него JSON объект:
 *
 * ```ts
 * {
 *  status: 'searching' | 'filled' | 'started',
 *  players: Array<Member>,
 *  spectators: Array<Member>
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function add_member(escort: IDataEscort) {
  try {
    let socketID = escort.get('socket_id') as string
    wsValidator.validateSocket(socketID)

    let member = escort.get('member')
    if (!member) throw new ValidationError('member', validationCause.REQUIRED)
    if (!MemberList.isMember(member))
      throw new ValidationError('member', validationCause.INVALID_FORMAT)

    let lobbyID = escort.get('lobby_id') as string
    if (typeof lobbyID != 'string')
      throw new ValidationError('lobby', validationCause.REQUIRED)

    let lobby = StandOffLobbies.get(lobbyID)
    if (!lobby) throw new ValidationError('lobby', validationCause.NOT_EXIST)

    let status = await lobby.addMember(member)
    if (!status) throw new MatchError(lobbyID, matchCause.ADD_MEMBER)

    clientServer.control(socketID).emit('sync_lobby', {
      status: lobby.status as string,
      players: JSON.stringify(lobby.members.players),
      spectators: JSON.stringify(lobby.members.spectators),
    })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('add_member error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('add_member error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('add_member error', { reason: 'unknown error' })
    }
  }
}

/**
 * Событие для удаления пользователя из лобби.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  lobby_id: string, //строка с id существующего лобби
 *  name: string //имя пользователя
 * }
 * ```
 *
 * В случае успеха создает ивент sync_lobby и отправляет на него JSON объект:
 *
 * ```ts
 * {
 *  status: 'searching' | 'filled' | 'started',
 *  players: Array<Member>,
 *  spectators: Array<Member>
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function remove_member(escort: IDataEscort) {
  try {
    let socketID = escort.get('socket_id') as string
    wsValidator.validateSocket(socketID)

    let lobbyID = escort.get('lobby_id') as string
    if (typeof lobbyID != 'string')
      throw new ValidationError('lobby', validationCause.REQUIRED)

    let name = escort.get('name')
    if (typeof name != 'string')
      throw new ValidationError('name', validationCause.REQUIRED)

    let lobby = StandOffLobbies.get(lobbyID)
    if (!lobby) throw new ValidationError('lobby', validationCause.NOT_EXIST)
    if (!lobby.members.hasMember(name))
      throw new ValidationError('name', validationCause.INVALID)

    let member = lobby.members.getMember(name)!
    if (member.teamID) member.teamID = undefined

    let status = await lobby.removeMember(member)
    if (!status) throw new MatchError(lobbyID, matchCause.REMOVE_MEMBER)

    clientServer.control(socketID).emit('sync_lobby', {
      status: lobby.status as string,
      players: JSON.stringify(lobby.members.players),
      spectators: JSON.stringify(lobby.members.spectators),
    })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('remove_member error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('remove_member error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('remove_member error', { reason: 'unknown error' })
    }
  }
}

/**
 * Событие для обновления статуса пользователя со стороны клиента.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  lobby_id: string, //строка с id существующего лобби
 *  member:
 *  {
 *    name: string //имя пользователя
 *    command: 'spectator' | 'neutral' | 'command1' | 'command2' | undefined
 *    readyFlag: boolean | undefined
 *    teamID?: number
 *  }
 * }
 * ```
 *
 * В случае успеха создает ивент sync_lobby и отправляет на него JSON объект:
 *
 * ```ts
 * {
 *  status: 'searching' | 'filled' | 'started',
 *  players: Array<Member>,
 *  spectators: Array<Member>
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function update_member(escort: IDataEscort) {
  try {
    let socketID = escort.get('socket_id') as string
    wsValidator.validateSocket(socketID)

    let member = escort.get('member')
    if (!member || typeof member != 'object')
      throw new ValidationError('member', validationCause.REQUIRED)
    if (typeof member.name != 'string')
      throw new ValidationError('member.name', validationCause.REQUIRED)

    let lobbyID = escort.get('lobby_id') as string
    if (typeof lobbyID != 'string')
      throw new ValidationError('lobby', validationCause.REQUIRED)

    let lobby = StandOffLobbies.get(lobbyID)
    if (!lobby) throw new ValidationError('lobby', validationCause.NOT_EXIST)

    if (!lobby.members.hasMember(member.name))
      throw new ValidationError('member', validationCause.NOT_EXIST)

    let status = await lobby.updateMember({
      name: member.name,
      command: member.command as string | undefined,
      readyFlag: member.readyFlag as string | undefined,
    })
    if (!status) throw new MatchError(lobbyID, matchCause.UPDATE_MEMBER)

    clientServer.control(socketID).emit('sync_lobby', {
      status: lobby.status as string,
      players: JSON.stringify(lobby.members.players),
      spectators: JSON.stringify(lobby.members.spectators),
    })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('update_member error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('update_member error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('update_member error', { reason: 'unknown error' })
    }
  }
}

/**
 * Событие для отправки сообщения в лобби.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  lobby_id: string
 *  username: string
 *  message: string
 * }
 * ```
 *
 * В случае успеха создает одноименный ивент и отправляет на него JSON объект:
 * ```ts
 * {
 *  complete: true
 * }
 * ```
 * Все события из чата матча будут приходить на event lobby_chat в формате:
 *
 * ```json
 * {
 *  "chat_id": "xxxxxx",
 *  "message":
 *  {
 *    "from": "system or username",
 *    "message": "text of message"
 *  }
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function send_to_chat(escort: IDataEscort) {
  try {
    let socketID = escort.get('socket_id') as string
    wsValidator.validateSocket(socketID)

    let lobbyID = escort.get('lobby_id')

    if (typeof lobbyID != 'string')
      throw new ValidationError('lobby', validationCause.INVALID_FORMAT)

    let lobby = StandOffLobbies.get(lobbyID)
    if (!lobby) throw new ValidationError('lobby', validationCause.NOT_EXIST)

    let user = escort.get('username')
    if (typeof user != 'string')
      throw new ValidationError('user', validationCause.INVALID_FORMAT)

    if (!lobby.members.hasMember(user))
      throw new ValidationError('user', validationCause.INVALID)

    let message = escort.get('message')
    if (typeof message != 'string')
      throw new ValidationError('message', validationCause.INVALID_FORMAT)
    await lobby.chat!.send(
      JSON.stringify({
        from: user,
        message: message,
      }),
    )

    clientServer.control(socketID).emit('send_to_lobby', { complete: true })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('send_to_lobby error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('send_to_lobby error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('send_to_lobby error', { reason: 'unknown error' })
    }
  }
}

/**
 * Событие для присоединения к команде.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  username: string
 *  team_id: string
 * }
 * ```
 *
 * В случае успеха создает одноименный ивент и отправляет на него JSON объект:
 * ```ts
 * {
 *  status: boolean
 *  chat_id?: team#number
 * }
 * ```
 * Все события из чата матча будут приходить на event lobby_chat в формате:
 *
 * ```json
 * {
 *  "chat_id": "xxxxxx",
 *  "message":
 *  {
 *    "from": "system or username",
 *    "message": "text of message"
 *  }
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function join_team(escort: IDataEscort) {
  try {
    let username = escort.get('username')
    if (!username || typeof username != 'string')
      throw new ValidationError('user', validationCause.INVALID_FORMAT)
    if (!(await UserModel.getByName(username)))
      throw new ValidationError('user', validationCause.INVALID)

    let teamID = escort.get('team_id')
    if (!teamID) throw new ValidationError('team_id', validationCause.REQUIRED)
    if (!Teams.has(Number(teamID)))
      throw new ValidationError('team_id', validationCause.INVALID)

    let team = Teams.get(Number(teamID))!
    team.join(username)

    team.chat.send(
      JSON.stringify({
        from: 'system',
        message: `${username} joined`,
      }),
    )

    clientServer.control(escort.get('socket_id')! as string).emit('join_team', {
      status: true,
      chat_id: `team#${team.chat.id}`,
    })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('join_team error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('join_team error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('join_team error', { reason: 'unknown error' })
    }
  }
}

/**
 * Событие для выхода из команды.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  username: string
 *  team_id: string
 * }
 * ```
 *
 * В случае успеха создает одноименный ивент и отправляет на него JSON объект:
 * ```ts
 * {
 *  status: boolean
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function leave_team(escort: IDataEscort) {
  try {
    let username = escort.get('username')
    if (!username || typeof username != 'string')
      throw new ValidationError('user', validationCause.INVALID_FORMAT)
    if (!(await UserModel.getByName(username)))
      throw new ValidationError('user', validationCause.INVALID)

    let teamID = escort.get('team_id')
    if (!teamID) throw new ValidationError('team_id', validationCause.REQUIRED)
    if (!Teams.has(Number(teamID)))
      throw new ValidationError('team_id', validationCause.INVALID)

    let team = Teams.get(Number(teamID))!
    team.leave(username)

    team.chat.send(
      JSON.stringify({
        from: 'system',
        message: `${username} leaved`,
      }),
    )

    clientServer
      .control(escort.get('socket_id')! as string)
      .emit('leave_team', {
        status: true,
      })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('leave_team error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('leave_team error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('leave_team error', { reason: 'unknown error' })
    }
  }
}

/**
 * Событие для проверки членов команды.</br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  username: string
 *  team_id: string
 * }
 * ```
 *
 * В случае успеха создает одноименный ивент и отправляет на него JSON объект:
 * ```ts
 * {
 *  members: Array<Members>
 * }
 * ```
 * @category MatchMaking
 * @event
 */
export async function check_team(escort: IDataEscort) {
  try {
    let teamID = escort.get('team_id')
    if (!teamID) throw new ValidationError('team_id', validationCause.REQUIRED)
    if (!Teams.has(Number(teamID)))
      throw new ValidationError('team_id', validationCause.INVALID)

    let team = Teams.get(Number(teamID))!
    clientServer
      .control(escort.get('socket_id')! as string)
      .emit('check_team', {
        members: JSON.stringify(team.check()),
      })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    if (e instanceof MatchUpError) {
      if (e.genericMessage)
        return clientServer
          .control(socketID)
          .emit('check_team error', { reason: e.genericMessage })
    } else if (e instanceof Error) {
      return clientServer
        .control(socketID)
        .emit('check_team error', { reason: e.message })
    } else {
      clientServer
        .control(escort.get('socket_id') as string)
        .emit('check_team error', { reason: 'unknown error' })
    }
  }
}
