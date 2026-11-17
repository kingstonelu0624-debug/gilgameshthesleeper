# Gilgameshthesleeper.com notes

## Done

- Version 1 has one main job: choose a sleep problem and receive one gentle, AI-guided wind-down plan.
- The difference is clear: it guides a person from their actual habit or worry instead of making them search through a large random-sound library.
- The OpenAI key stays in the local server and is read only from `.env`.
- Model with “luna” in its name: `gpt-5.6-luna`.
- The AI turn uses the model’s fastest reasoning setting and a shorter answer limit so it can respond sooner.
- The AI answer now streams onto the page as it arrives, with a 30-second timeout instead of an endless loading state.
- If OpenAI rejects the key, the app now says to replace the key instead of blaming the internet.
- Safety wording is built in: no diagnosis or medication advice, gentle guidance, and a trusted-adult or healthcare-professional suggestion when needed.
- Two made-up sample stories are included for the demo.
- Saves on this computer only for now.

## Run it

From this folder, run:

`python3 server.py`

Then open [http://localhost:3000](http://localhost:3000).

## Maybe Later

- Add voice input and voice playback.
- Add a real database and accounts.
- Add optional long-running calming sounds.
- Create the competition PDF and four-minute demo video.
- Add a more detailed sleep history and progress view.
