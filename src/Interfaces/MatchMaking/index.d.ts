import type { ILobby, IMatchMember } from './Lobby'
import type { MatchController } from './Controller'
import type { IManager } from '../'
import type { IStatistic } from './Statistic'
import type { TeamsManager, ITeam } from './Team'

export declare namespace Match {
  namespace Manager {
    interface Instance extends IManager<Match.Lobby.Instance, string> {
      get Lobbies(): IterableIterator<Match.Lobby.Instance>
    }
    type supportedGames = 'StandOff2'
  }
  namespace Lobby {
    interface Instance extends ILobby {}
    type status = 'searching' | 'filled' | 'started'
  }
  namespace Member {
    interface Instance extends IMatchMember {}
    type command = 'spectator' | 'neutral' | 'command1' | 'command2'
    interface Statistic extends IStatistic {}
  }

  namespace Team {
    interface Manager extends TeamsManager {}
    interface Instance extends ITeam {}
  }

  interface Controller extends MatchController {}

  const enum Result {
    LOSE = 0,
    DRAW = 0.5,
    WIN = 1,
  }
}

export * from './Rating'
