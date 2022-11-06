import type { IDataEscort } from 'gamesocket.io'
import { clientServer } from '../clientSocketServer'
import { WS_SERVER } from '../../../app'
import { WebSocketValidatior } from '../../../validation/websocket'

import { APIManager } from '../../../Classes/RoleManager/APIRolesManager'
import { API_ACTION_LIST, isValidAPIAction } from '../../../configs/API/actions'

import {
  isMatchUpError,
  MatchUpError,
  ServerCause,
  ServerError,
  TechnicalCause,
  TechnicalError,
} from '../../../error'
import { WebSocket } from 'uWebSockets.js'
import { DTO } from '../../../Classes/DTO/DTO'
import { dtoParser } from '../../../Classes/DTO/Parser/Parser'

const wsValidator = new WebSocketValidatior(WS_SERVER)
let RoleManager = new APIManager()

/**
 * Обработчик для события dark-side.
 * В качестве пакета принимает:
 * ```json
 * {
 *  "label": "идентефикатор, с которым возвращается результат выполнения запроса"
 *  "function": "имя функции, имеющийся в списке доступных",
 *  "params": [],
 *  "__comment_params": "это массив параметров, которые будут переданы в вызванную функцию"
 * }
 * ```
 *
 * В случае ошибки, если function был найден, вернет событие ошибки с названием формата `${function} error` и следующим пакетом:
 * ```json
 * {
 *  "reason": "error reason message"
 * }
 * ```
 *
 * Если же function не существует, то вернет событие ошибки с названием dark-side error и следующим пакетом:
 * ```json
 * {
 *  "reason": "error reason message"
 * }
 * ```
 *
 * @category Basic
 * @event dark-side
 */
export function darkSideHandler(escort: IDataEscort) {
  try {
    let socketID = escort.get('socket_id') as string
    wsValidator.validateSocket(socketID)

    let socket = WS_SERVER.sockets.get(socketID)!
    let username = socket.username as string

    const request = dtoParser.from.Object(escort.used)

    let action = request.content.action
    if (!action) throw new TechnicalError('function', TechnicalCause.REQUIRED)
    if (typeof action != 'string')
      throw new TechnicalError('function', TechnicalCause.INVALID_FORMAT)

    let params = request.content.params
    if (!params) throw new TechnicalError('params', TechnicalCause.REQUIRED)
    if (typeof params != 'object' || !(params instanceof Array))
      throw new TechnicalError('params', TechnicalCause.INVALID_FORMAT)

    if (!isValidAPIAction(action))
      throw new TechnicalError('action', TechnicalCause.INVALID)

    if (!RoleManager.hasAccess(username, action))
      throw new Error('Low access level')

    let controller = CONTROLLERS.get(action)
    if (!controller)
      throw new TechnicalError('action controller', TechnicalCause.NOT_EXIST)

    controller(socket, params).then((result) => {
      let response: DTO
      if (result == true)
        response = new DTO({
          label: request.label,
          status: 'success',
        })
      else
        response = new DTO({
          label: request.label,
          response: result,
        })

      clientServer.control(socketID).emit('dark-side', response.to.JSON)
    })
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    let error: DTO
    if (!isMatchUpError(e))
      error = new ServerError(ServerCause.UNKNOWN_ERROR).DTO
    else error = e.DTO

    return clientServer.control(socketID).emit(`dark-side`, error.to.JSON)
  }
}
clientServer.on('dark-side', darkSideHandler)

export const CONTROLLERS: Map<
  API_ACTION_LIST,
  (socket: WebSocket, params: unknown[]) => Promise<unknown>
> = new Map()
