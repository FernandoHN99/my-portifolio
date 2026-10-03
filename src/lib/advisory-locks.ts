// Chaves dos bloqueios consultivos do Postgres que serializam as gravações em
// massa: a virada de mês, a atualização de cotações e quem precisa impedir as
// duas, como a restauração de backup (spec 042).
export const QUOTE_REFRESH_LOCK_KEY = 2_026_100_201;
export const MONTH_ROLLOVER_LOCK_KEY = 2_026_100_202;
