import {
  ACHIEVEMENT_CATALOG_VERSION,
  type AchievementCategory,
  type AchievementDefinition,
  type AchievementFilter,
  type AchievementId,
  type AchievementMetric,
  type AchievementPresentation,
  type AchievementScope,
  type AchievementUnit,
  type LocalizedAchievementText,
} from "./AchievementContracts";

const text = (en: string, tr: string): LocalizedAchievementText => Object.freeze({ en, tr });

interface DefinitionInput {
  readonly id: AchievementId;
  readonly category: AchievementCategory;
  readonly scope: AchievementScope;
  readonly metric: AchievementMetric;
  readonly target: number;
  readonly unit: AchievementUnit;
  readonly title: readonly [string, string];
  readonly description: readonly [string, string];
  readonly hint?: readonly [string, string];
}

function definition(input: DefinitionInput, order: number): AchievementDefinition {
  const { title, description, hint, ...metadata } = input;
  return Object.freeze({
    ...metadata,
    title: text(...title),
    description: text(...description),
    ...(hint ? { hint: text(...hint) } : {}),
    visibility: input.category === "single-match" ? "partially-hidden" : "public",
    reward: "badge",
    catalogVersion: ACHIEVEMENT_CATALOG_VERSION,
    order,
  });
}

const inputs: readonly DefinitionInput[] = [
  { id: "rookie_campaign", category: "singleplayer-career", scope: "singleplayer-career", metric: "singleplayer-games", target: 10, unit: "games", title: ["Rookie Campaign", "Çaylak Seferi"], description: ["Complete 10 Singleplayer games.", "10 Tek Oyunculu maçı tamamla."] },
  { id: "hundred_games", category: "singleplayer-career", scope: "singleplayer-career", metric: "singleplayer-games", target: 100, unit: "games", title: ["100 Games", "100 Maç"], description: ["Complete 100 Singleplayer games.", "100 Tek Oyunculu maçı tamamla."] },
  { id: "dedicated_player", category: "singleplayer-career", scope: "singleplayer-career", metric: "singleplayer-games", target: 500, unit: "games", title: ["Dedicated Player", "Adanmış Oyuncu"], description: ["Complete 500 Singleplayer games.", "500 Tek Oyunculu maçı tamamla."] },
  { id: "king_hunter", category: "singleplayer-career", scope: "singleplayer-career", metric: "singleplayer-kings-captured", target: 10, unit: "captures", title: ["King Hunter", "Şah Avcısı"], description: ["Capture 10 enemy kings in Singleplayer.", "Tek Oyunculu modda 10 rakip şahı ele geçir."] },
  { id: "capture_hundred_kings", category: "singleplayer-career", scope: "singleplayer-career", metric: "singleplayer-kings-captured", target: 100, unit: "captures", title: ["Capture 100 Kings", "100 Şah Yakala"], description: ["Capture 100 enemy kings in Singleplayer.", "Tek Oyunculu modda 100 rakip şahı ele geçir."] },
  { id: "winning_run", category: "singleplayer-career", scope: "singleplayer-career", metric: "singleplayer-best-win-streak", target: 3, unit: "streak", title: ["Winning Run", "Galibiyet Serisi"], description: ["Reach a best Singleplayer win streak of 3.", "Tek Oyunculu modda en az 3 maçlık galibiyet serisine ulaş."] },

  { id: "ranked_victor", category: "ranked-multiplayer", scope: "ranked-multiplayer", metric: "ranked-wins", target: 1, unit: "games", title: ["Ranked Victor", "Dereceli Galip"], description: ["Win your first Ranked Multiplayer game.", "İlk Dereceli Çok Oyunculu maçını kazan."] },
  { id: "ranked_regular", category: "ranked-multiplayer", scope: "ranked-multiplayer", metric: "ranked-games", target: 25, unit: "games", title: ["Ranked Regular", "Dereceli Müdavimi"], description: ["Complete 25 Ranked Multiplayer games.", "25 Dereceli Çok Oyunculu maçı tamamla."] },
  { id: "ranked_veteran", category: "ranked-multiplayer", scope: "ranked-multiplayer", metric: "ranked-games", target: 100, unit: "games", title: ["Ranked Veteran", "Dereceli Veteranı"], description: ["Complete 100 Ranked Multiplayer games.", "100 Dereceli Çok Oyunculu maçı tamamla."] },
  { id: "winning_streak", category: "ranked-multiplayer", scope: "ranked-multiplayer", metric: "ranked-best-win-streak", target: 5, unit: "streak", title: ["Winning Streak", "Kazanan Seri"], description: ["Reach a best Ranked win streak of 5.", "Dereceli modda en az 5 maçlık galibiyet serisine ulaş."] },
  { id: "rating_climber", category: "ranked-multiplayer", scope: "ranked-multiplayer", metric: "ranked-rating", target: 1200, unit: "rating", title: ["Rating Climber", "Rating Tırmanıcısı"], description: ["Reach a trusted Ranked rating of 1200.", "Güvenilir Dereceli rating değerinde 1200'e ulaş."] },
  { id: "elite_player", category: "ranked-multiplayer", scope: "ranked-multiplayer", metric: "ranked-rating", target: 1500, unit: "rating", title: ["Elite Player", "Elit Oyuncu"], description: ["Reach a trusted Ranked rating of 1500.", "Güvenilir Dereceli rating değerinde 1500'e ulaş."] },

  { id: "wheel_spinner", category: "global-roulette", scope: "global-career", metric: "global-roulette-rolls", target: 100, unit: "rolls", title: ["Wheel Spinner", "Çark Çevirici"], description: ["Complete 100 roulette rolls across all modes.", "Tüm modlarda toplam 100 rulet sonucu tamamla."] },
  { id: "roulette_master", category: "global-roulette", scope: "global-career", metric: "global-roulette-rolls", target: 1000, unit: "rolls", title: ["Roulette Master", "Rulet Ustası"], description: ["Complete 1,000 roulette rolls across all modes.", "Tüm modlarda toplam 1.000 rulet sonucu tamamla."] },
  { id: "roll_collector", category: "global-roulette", scope: "global-career", metric: "global-roulette-rolls", target: 5000, unit: "rolls", title: ["Roll Collector", "Zar Koleksiyoncusu"], description: ["Complete 5,000 roulette rolls across all modes.", "Tüm modlarda toplam 5.000 rulet sonucu tamamla."] },
  { id: "triple_crown", category: "global-roulette", scope: "global-career", metric: "global-triple-piece-types", target: 6, unit: "piece-types", title: ["Triple Crown", "Üçlü Taç"], description: ["Roll at least one triple for every piece type.", "Her taş türü için en az bir üçlü sonuç getir."] },
  { id: "triple_collector", category: "global-roulette", scope: "global-career", metric: "global-triple-rolls", target: 100, unit: "rolls", title: ["Triple Collector", "Üçlü Koleksiyoncusu"], description: ["Roll 100 triples across all piece types.", "Tüm taş türlerinde toplam 100 üçlü sonuç getir."] },
  { id: "full_rights", category: "global-roulette", scope: "global-career", metric: "global-three-rights-turns", target: 25, unit: "turns", title: ["Full Rights", "Tüm Haklar"], description: ["Use all three move rights in 25 player turns.", "25 oyuncu turunda üç hamle hakkının tamamını kullan."] },

  { id: "pawn_commander", category: "global-piece-mastery", scope: "global-career", metric: "global-pawn-moves", target: 500, unit: "moves", title: ["Pawn Commander", "Piyon Komutanı"], description: ["Complete 500 successful pawn moves across all modes.", "Tüm modlarda piyonlarla 500 başarılı hamle yap."] },
  { id: "knight_specialist", category: "global-piece-mastery", scope: "global-career", metric: "global-knight-moves", target: 250, unit: "moves", title: ["Knight Specialist", "At Uzmanı"], description: ["Complete 250 successful knight moves across all modes.", "Tüm modlarda atlarla 250 başarılı hamle yap."] },
  { id: "royal_maneuvers", category: "global-piece-mastery", scope: "global-career", metric: "global-king-moves", target: 100, unit: "moves", title: ["Royal Maneuvers", "Kraliyet Manevraları"], description: ["Complete 100 successful king moves across all modes.", "Tüm modlarda şahlarla 100 başarılı hamle yap."] },
  { id: "roulette_legend", category: "singleplayer-progression", scope: "singleplayer-career", metric: "singleplayer-level", target: 50, unit: "level", title: ["Roulette Legend", "Rulet Efsanesi"], description: ["Reach Singleplayer level 50.", "Tek Oyunculu ilerlemede 50. seviyeye ulaş."] },

  { id: "the_long_march", category: "single-match", scope: "singleplayer-match", metric: "match-total-moves", target: 75, unit: "moves", title: ["The Long March", "Uzun Yürüyüş"], description: ["Complete a Singleplayer match with at least 75 successful moves by both sides combined.", "İki tarafın toplam en az 75 başarılı hamle yaptığı bir Tek Oyunculu maçı tamamla."], hint: ["Some battles are remembered for their length.", "Bazı savaşlar uzunluklarıyla hatırlanır."] },
  { id: "royal_ascension", category: "single-match", scope: "singleplayer-match", metric: "match-distinct-promotions", target: 3, unit: "promotions", title: ["Royal Ascension", "Kraliyet Yükselişi"], description: ["Promote three distinct pawns in one completed Singleplayer match.", "Tamamlanmış tek bir Tek Oyunculu maçta üç farklı piyonu terfi ettir."], hint: ["A humble beginning may have a royal ending.", "Mütevazı bir başlangıç kraliyetle sonuçlanabilir."] },
  { id: "last_one_standing", category: "single-match", scope: "singleplayer-match", metric: "match-enemy-captures", target: 12, unit: "captures", title: ["Last One Standing", "Ayakta Kalan Son Taş"], description: ["Capture at least 12 enemy pieces, including the king, and win by king capture.", "Şah dahil en az 12 rakip taşı ele geçir ve şahı yakalayarak kazan."], hint: ["Leave little standing between you and the throne.", "Tahtla aranda ayakta çok az şey bırak."] },
  { id: "wheels_favor", category: "single-match", scope: "singleplayer-match", metric: "match-triple-rolls", target: 4, unit: "rolls", title: ["Wheel's Favor", "Çarkın Lütfu"], description: ["Roll four triples in one completed Singleplayer match.", "Tamamlanmış tek bir Tek Oyunculu maçta dört üçlü sonuç getir."], hint: ["Fortune sometimes repeats itself.", "Şans bazen kendini tekrarlar."] },
  { id: "against_all_odds", category: "single-match", scope: "singleplayer-match", metric: "match-final-own-pieces", target: 3, unit: "pieces", title: ["Against All Odds", "Tüm Zorluklara Rağmen"], description: ["Win by king capture with no more than three of your pieces, including your king, remaining.", "Şahın dahil en fazla üç taşın kalmışken rakip şahı ele geçirerek kazan."], hint: ["Victory shines brightest when almost everything is lost.", "Zafer, neredeyse her şey kaybedildiğinde daha parlak görünür."] },
  { id: "untouchable", category: "single-match", scope: "singleplayer-match", metric: "match-own-pieces-captured", target: 0, unit: "pieces", title: ["Untouchable", "Dokunulmaz"], description: ["Win by king capture without losing a single piece.", "Tek bir taşını bile kaybetmeden rakip şahı ele geçirerek kazan."], hint: ["Victory without sacrifice.", "Kayıpsız zafer."] },
  { id: "pawn_rebellion", category: "single-match", scope: "singleplayer-match", metric: "match-pawn-captures", target: 8, unit: "captures", title: ["Pawn Rebellion", "Piyon İsyanı"], description: ["Capture eight enemy pieces with pieces that are pawns at the moment of capture.", "Ele geçirme anında piyon olan taşlarla sekiz rakip taşı ele geçir."], hint: ["The smallest pieces can start the greatest uprising.", "En küçük taşlar en büyük isyanı başlatabilir."] },
  { id: "perfect_rhythm", category: "single-match", scope: "singleplayer-match", metric: "match-consecutive-three-rights-turns", target: 10, unit: "turns", title: ["Perfect Rhythm", "Kusursuz Ritim"], description: ["Use all three move rights in ten consecutive player turns in one completed match.", "Tamamlanmış tek bir maçta art arda on oyuncu turunda üç hamle hakkının tamamını kullan."], hint: ["Keep the rhythm without missing a beat.", "Tek bir vuruşu kaçırmadan ritmi koru."] },
];

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = Object.freeze(
  inputs.map((input, index) => definition(input, index + 1)),
);

export const ACHIEVEMENT_DEFINITIONS: Readonly<Record<AchievementId, AchievementDefinition>> =
  Object.freeze(Object.fromEntries(ACHIEVEMENT_CATALOG.map((item) => [item.id, item]))) as
    Readonly<Record<AchievementId, AchievementDefinition>>;

export function getAchievementsForFilter(filter: AchievementFilter): readonly AchievementDefinition[] {
  if (filter === "all") return ACHIEVEMENT_CATALOG;
  const categoryByFilter: Readonly<Record<Exclude<AchievementFilter, "all">, AchievementCategory>> = {
    singleplayer: "singleplayer-career",
    ranked: "ranked-multiplayer",
    roulette: "global-roulette",
    "piece-mastery": "global-piece-mastery",
    progression: "singleplayer-progression",
    "single-match": "single-match",
  };
  return ACHIEVEMENT_CATALOG.filter((item) => item.category === categoryByFilter[filter]);
}

export function getAchievementPresentation(
  achievement: AchievementDefinition,
  unlocked: boolean,
): AchievementPresentation {
  const concealed = achievement.visibility === "partially-hidden" && !unlocked;
  return {
    id: achievement.id,
    title: achievement.title,
    ...(concealed ? { hint: achievement.hint } : { description: achievement.description, target: achievement.target }),
    locked: !unlocked,
    displayProgress: !concealed,
  };
}
