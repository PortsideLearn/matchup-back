/**
 *
 * Для взаимодействия с клиентским сервером необходимо подключиться к ws://server.name:PORT/client
 * И передавать в пакете JSON объект, содержащий поле event, а также оговоренные в конкретном хэндлере поля
 *
 * В случае ошибок шлет на ${event} error объект JSON с полем reason
 * @module LobbyHandlers
 * @packageDocumentation
 */

import { WS_SERVER } from '../../app'
import * as Handlers from './Handlers'

let clientServer = WS_SERVER.of(process.env.CLIENT_NAMESPACE!)

/* Basic handlers for user authorization */
clientServer.on('authorize', Handlers.authorize)
clientServer.on('change_role', Handlers.change_role)

/* Handlers for admins only */
clientServer.on('get_users', Handlers.get_users)
clientServer.on('get_reports', Handlers.get_reports)
clientServer.on('get_matchs', Handlers.get_matchs)

/* Handlers for all users */
clientServer.on('get_statistic', Handlers.get_statistic)

/* Match hanlers */
clientServer.on('find_lobby', Handlers.find_lobby)
clientServer.on('sync_lobby', Handlers.sync_lobby)
clientServer.on('add_member', Handlers.add_member)
clientServer.on('remove_member', Handlers.remove_member)

/* Chat handlers */
clientServer.on('send_to_chat', Handlers.send_to_chat)
export { clientServer }
