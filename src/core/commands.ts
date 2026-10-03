/**
 * Commands are the only way the player changes the world: "build a wall
 * here", "set speed" lives outside the sim, "draft this colonist" lives in.
 * Modules add command types by augmenting CommandMap, the same way as
 * signals. Every applied command is logged with its tick, so a game can be
 * replayed exactly from its seed and command log.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CommandMap {}

export type CommandType = keyof CommandMap & string;

export type Command = {
  [K in CommandType]: { type: K; payload: CommandMap[K] };
}[CommandType];

/** A command as stored in the log: the tick it was applied on, plus the command. */
export interface LoggedCommand {
  tick: number;
  type: string;
  payload: unknown;
}
