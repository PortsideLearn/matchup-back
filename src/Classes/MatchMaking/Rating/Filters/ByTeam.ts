import type { Match, Rating } from '../../../../Interfaces/index'
import { TEAMS } from '../../index'

export class ByTeamFilter implements Rating.SearchEngine.Filter {
  private _ID!: number
  constructor() {}

  getResults(lobbies: Array<Match.Lobby.Instance>): Array<string> {
    let tmp: Array<string> = new Array()
    for (let index = 0; index < lobbies.length; index++)
      if (lobbies[index].canAddTeam(this._ID)) tmp.push(lobbies[index].id)

    return tmp
  }

  set id(value: number) {
    if (TEAMS.get(value)) this._ID = value
  }

  get priority(): Rating.SearchEngine.FILTER_PRIORITY {
    return 'required'
  }
}
