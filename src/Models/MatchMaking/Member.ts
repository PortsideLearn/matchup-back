import { prop, Ref } from '@typegoose/typegoose'
import { Match } from '../../Interfaces'
import { Statistic } from './Statistic'

export class MemberRecord {
  @prop({ required: true })
  public name!: string
  @prop({ required: true })
  public command!: Match.Lobby.Command.Types
  @prop({ required: true, default: new Statistic(), _id: false })
  public statistic!: Statistic
}
