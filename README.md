# board-game-timer
Chess timer for more than 2 players. It is *pretty* hardcoded currently. We'll fix it eventually.

## installing
I don't know, honestly. `npm install` probably??
## running
`bun run index.tsx` or something

## TODO:
* Fireworks displayed for the last player standing (WIP)
    * Plan: New message.type value: `sfx`.
    * Will have a message.effect field for what effect to play.
    * Should just be, like, `winner` or `fireworks` but nice to have options.
* Add timer changes. (only when running == false)
* Add resets.
* ~~Make rejoining actually work~~ DONE
* ~~Add new player to list on join~~ DONE
* ~~Switch current player to last player standing~~ DONE
