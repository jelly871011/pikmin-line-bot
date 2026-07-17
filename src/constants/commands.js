// Central registry of every Bot command keyword, grouped by feature.
//
// This is the single source of truth for command lists. Help messages, the
// "全部指令" listing, quick help, and command suggestion all read from here —
// do not duplicate command lists anywhere else. Adding a keyword here makes it
// appear everywhere those features are generated.

export const COMMANDS = {
  mushroom: ['查詢', '玩家', '幫助', '最佳'],
  power: ['幫助', '合計'],
  whale: ['新增', '刪除', '統計', '幫助'],
  system: ['幫助', '全部指令', '資訊', '版本', '更新紀錄'],
};

// The prefix keyword that introduces each feature family. System commands have
// no prefix (they are typed directly, e.g. "版本").
export const COMMAND_PREFIXES = {
  mushroom: '菇',
  power: '戰力',
  whale: '課長',
  system: null,
};

// Every recognised top-level token a user might type, used by command
// suggestion to decide whether an unknown input is "close" to a real command.
export const KNOWN_PREFIXES = ['菇', '戰力', '課長'];

// System commands are bare keywords (no prefix). Listed explicitly so the
// parser and suggestion engine agree on what counts as a system command.
export const SYSTEM_COMMANDS = COMMANDS.system;
