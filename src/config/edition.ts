/** Credits for this independent Windows UI and PDF workflow revision. */
export const EDITION = {
  coAuthor: 'aoki',
  originalAuthor: 'Loshop',
  sourceUrl: 'https://github.com/Loshop-Studio/ZhongYuToolBox_Web'
} as const

/** This edition checks its own releases, without account information. */
export const RELEASE_REPOSITORY = import.meta.env.VITE_RELEASE_REPOSITORY === 'Loshop-Studio/ZhongYuToolBox_Web'
  ? 'Loshop-Studio/ZhongYuToolBox_Web' : 'nickfox395/ZhongYuToolBox_Web'
/** The maintainer's discussion group; source never contains a QQ login credential. */
export const QQ_FEEDBACK_GROUP = '1067807011'
