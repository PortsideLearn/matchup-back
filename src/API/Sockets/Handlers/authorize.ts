import type { IDataEscort } from 'gamesocket.io'
import { clientServer } from '../clientSocketServer'
import { WS_SERVER } from '../../../app'

import { WebSocketValidatior } from '../../../validation/index'
import { validatePacket } from '../../../Token/index'
import { isMatchUpError, ServerCause, ServerError } from '../../../error'
import { DTO } from '../../../Classes/DTO/DTO'
import { dtoParser } from '../../../Classes/DTO/Parser/Parser'

let wsValidator = new WebSocketValidatior(WS_SERVER)

/**
 * Событие для авторизации сокета. </br>
 * Используемый пакет:
 *
 * ```ts
 * {
 *  token: string //полученный при авторизации пользователя
 * }
 * ```
 *
 * @category Authorization
 * @event
 */
export function authorize(escort: IDataEscort) {
  try {
    const request = dtoParser.from.Object(escort.used)
    let token = validatePacket(request)

    let socketID = escort.get('socket_id') as string
    let socket = WS_SERVER.sockets.get(socketID)!

    socket.role = token.role
    socket.username = token.username

    wsValidator.authorizeSocket(socketID)

    clientServer.Aliases.set(socket.username, socket.id)
    const response = new DTO({ status: 'success' })
    return clientServer.control(socketID).emit('authorize', response.to.JSON)
  } catch (e) {
    let socketID = escort.get('socket_id') as string
    let error: DTO
    if (!isMatchUpError(e))
      error = new ServerError(ServerCause.UNKNOWN_ERROR).DTO
    else error = e.DTO

    return clientServer.control(socketID).emit(`dark-side`, error.to.JSON)
  }
}
clientServer.on('authorize', authorize)
