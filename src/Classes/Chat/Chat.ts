import type { Namespace } from 'gamesocket.io'
import type { DocumentType } from '@typegoose/typegoose'
import type { IChat } from '../../Interfaces/index'
import { Chat as DBChat } from '../../Models/Chat/Chat'
import { DTO } from '../DTO/DTO'
import { Message } from './Message'

export class Chat implements IChat.Controller {
  private _members: Array<string> = []
  constructor(
    private _document: DocumentType<DBChat>,
    private _namespace: Namespace,
  ) {
    for (let member of _document.members) this._members.push(member.name)
  }

  async join(user: string): Promise<true> {
    if (!this._document.hasMember(user)) await this._document.join(user)

    this._namespace.control(this.id).join(this._namespace.Aliases.get(user)!)

    const systemMessage = new Message('system', `${user} joined`)
    await this.message(systemMessage)
    return true
  }

  async leave(user: string): Promise<true> {
    if (this._document.hasMember(user)) await this._document.leave(user)

    this._namespace.control(this.id).leave(this._namespace.Aliases.get(user)!)

    const systemMessage = new Message('system', `${user} leaved`)
    await this.message(systemMessage)
    return true
  }

  async message(message: IChat.Message): Promise<true> {
    let dto = new DTO({ label: 'message', id: this.id, message })
    this._document.message(message)
    this._namespace.control(this.id).emit('chat', dto.to.JSON)

    return true
  }

  async delete(): Promise<true> {
    for (let member of this.members) await this.leave(member)
    await this._document.delete()

    return true
  }

  get id(): string {
    return this._document.info.id
  }

  get type(): IChat.Type {
    return this._document.info.type
  }

  get members() {
    return this._members
  }
}