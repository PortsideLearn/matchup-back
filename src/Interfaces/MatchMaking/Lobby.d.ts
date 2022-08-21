import type { Match } from './'
import type { IEntity } from '../'
import { MemberList } from '../../Classes'
export declare interface ILobby extends IEntity<string> {
  get id(): string
  get status(): Match.Lobby.status | undefined
  get game(): Match.Manager.supportedGames
  get members(): MemberList

  start(): Promise<boolean>
  stop(): Promise<boolean>

  addMember(member: Match.Member.Interface): Promise<boolean>
  removeMember(member: Match.Member.Interface): Promise<boolean>
  updateMember(
    member: Required<Pick<Match.Member.Interface, 'name'>> & {
      [Key in Exclude<keyof Match.Member.Interface, 'name' | 'statistic'>]?:
        | Match.Member.Interface[Key]
        | string
    },
  ): Promise<boolean>
}
