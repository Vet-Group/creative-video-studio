-- The motion templates from 0020 get Vietnamese labels, as every other preset label is Vietnamese UI text (packages/core/src/presets.ts). A label
-- the Admin has already renamed is left as it is.
UPDATE "presets" SET "label" = v."label" FROM (VALUES
	('shoulder-sequence', 'Shoulder Sequence', U&'C\1eadn vai r\1ed3i to\00e0n th\00e2n'),
	('turn-around', 'Turn Around', U&'Xoay m\1ed9t v\00f2ng'),
	('effortless-flip', 'Effortless Flip', U&'H\1ea5t t\00f3c t\1ef1 nhi\00ean'),
	('studio-poise', 'Studio Pose', U&'T\1ea1o d\00e1ng studio'),
	('arc-right', 'Arc Right', U&'Lia v\00f2ng sang ph\1ea3i'),
	('arc-left', 'Arc Left', U&'Lia v\00f2ng sang tr\00e1i'),
	('smile-pose', 'Smile & Pose', U&'C\01b0\1eddi v\00e0 t\1ea1o d\00e1ng'),
	('step-back', 'Step Back', U&'L\00f9i m\1ed9t b\01b0\1edbc'),
	('the-approach', 'The Approach', U&'C\1eadn d\1ea7n v\00e0o m\1eb7t'),
	('head-to-toe-shot', 'Head-to-Toe Shot', U&'Qu\00e9t t\1eeb ch\00e2n l\00ean \0111\1ea7u'),
	('walk-right', 'Walk Right', U&'\0110i sang ph\1ea3i'),
	('walk-left', 'Walk Left', U&'\0110i sang tr\00e1i'),
	('minimal-motion', 'Minimal Motion', U&'Chuy\1ec3n \0111\1ed9ng t\1ed1i gi\1ea3n'),
	('doberman-gaze', 'Doberman Gaze', U&'\00c1nh nh\00ecn s\1eafc l\1ea1nh'),
	('runway-walk', 'Runway Walk', U&'S\1ea3i b\01b0\1edbc catwalk'),
	('face-rush', 'Face Rush', U&'Lao nhanh v\00e0o m\1eb7t'),
	('outfit-check', 'Outfit Check', U&'Ng\1eafm tr\1ecdn b\1ed9 \0111\1ed3'),
	('outfit-reveal', 'Outfit Reveal', U&'H\00e9 l\1ed9 trang ph\1ee5c'),
	('golden-hour-wall', 'Golden Hour Wall', U&'T\01b0\1eddng n\1eafng ho\00e0ng h\00f4n')
) AS v("id", "old", "label") WHERE "presets"."id" = v."id" AND "presets"."label" = v."old";
