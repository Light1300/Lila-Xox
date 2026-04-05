export type SiteConfig = typeof siteConfig

export const siteConfig = {
  name: "TicTacToe",
  description:
    "TicTacToe Game, built with Nextjs + Nakama",
  mainNav: [
    {
      title: "Home",
      href: "/",
    },
    {
      title: "Game",
      href: "/tictactoe",
    },
  ],
  links: {
    twitter: "https://x.com/SarveshPat21415",
    github: "https://github.com/Light1300/",
    docs: "https://ui.shadcn.com",
  },
}
