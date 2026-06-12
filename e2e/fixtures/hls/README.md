# HLS test fixture

A single 10-second, 240p HLS segment + media playlist, served by Playwright
route mocks in `e2e/resume-skip-regression.spec.js` so tests can play real
video without touching the network or production streams.

Content: the first segment of Big Buck Bunny (© Blender Foundation,
CC-BY 3.0, peach.blender.org), taken from Mux's public HLS test stream
(test-streams.mux.dev/x36xhzz). Used here solely as a tiny decodable
H.264/AAC sample.
