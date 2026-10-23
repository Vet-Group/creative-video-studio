-- Rounds to whole units with ties going to the even neighbour (banker's rounding). Postgres round() sends ties away from zero.
-- Every VND amount of the Costs page and both CSVs is computed with this one function (plan M.5).
CREATE FUNCTION "round_half_even"(numeric) RETURNS numeric LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
	SELECT CASE WHEN abs($1 - trunc($1)) = 0.5 THEN 2 * round($1 / 2) ELSE round($1) END
$$;
