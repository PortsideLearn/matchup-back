import type { Member } from '../Lobby'
export declare type matchStatus = 'searching' | 'filled' | 'started'

export declare interface MatchController {
  get status(): Exclude<matchStatus, 'searching'>

  create(): Promise<boolean>
  start(): Promise<boolean>
  stop(): Promise<boolean>

  addMembers(...members: Array<Member>): Promise<boolean>
  removeMembers(...members: Array<Member>): Promise<boolean>
}
