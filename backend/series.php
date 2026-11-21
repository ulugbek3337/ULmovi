<?php
declare(strict_types=1);

/**
 * Public VIDORA series catalog queries.
 *
 * These functions deliberately return metadata only. Storage paths and Drive
 * identifiers are never exposed by public catalog endpoints.
 */
function vidora_list_published_series(PDO $pdo, string $query = '', int $limit = 24, int $offset = 0): array
{
    $limit = max(1, min(100, $limit));
    $offset = max(0, $offset);
    $query = trim($query);
    $like = '%' . $query . '%';

    $statement = $pdo->prepare(
        "SELECT s.id, s.title, s.description, s.year, s.genre, s.poster_url, s.status,
                s.created_at, s.updated_at,
                (s.poster_path IS NOT NULL OR s.poster_url IS NOT NULL) AS has_poster,
                (SELECT COUNT(*) FROM seasons se
                 JOIN episodes e ON e.season_id = se.id
                 WHERE se.series_id = s.id AND e.status = 'published') AS episode_count,
                (SELECT COUNT(*) FROM seasons se
                 WHERE se.series_id = s.id
                   AND EXISTS (SELECT 1 FROM episodes e
                               WHERE e.season_id = se.id AND e.status = 'published')) AS season_count
         FROM series s
         WHERE s.status = 'published'
           AND (? = '' OR s.title LIKE ? OR COALESCE(s.genre, '') LIKE ?)
         ORDER BY s.updated_at DESC, s.id DESC
         LIMIT ? OFFSET ?"
    );
    $statement->execute([$query, $like, $like, $limit, $offset]);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function vidora_get_published_series(PDO $pdo, int $seriesId): ?array
{
    if ($seriesId < 1) {
        return null;
    }

    $statement = $pdo->prepare(
        "SELECT id, title, description, year, genre, poster_url,
                (poster_path IS NOT NULL OR poster_url IS NOT NULL) AS has_poster,
                created_at, updated_at
         FROM series WHERE id = ? AND status = 'published' LIMIT 1"
    );
    $statement->execute([$seriesId]);
    $series = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$series) {
        return null;
    }

    $statement = $pdo->prepare(
        "SELECT se.id, se.season_number, se.title, se.description,
                se.created_at, se.updated_at
         FROM seasons se
         WHERE se.series_id = ?
           AND EXISTS (SELECT 1 FROM episodes e
                       WHERE e.season_id = se.id AND e.status = 'published')
         ORDER BY se.season_number ASC"
    );
    $statement->execute([$seriesId]);
    $seasons = $statement->fetchAll(PDO::FETCH_ASSOC);

    $episodesQuery = $pdo->prepare(
        "SELECT e.id, e.episode_number, e.title, e.description,
                e.duration_seconds, e.status, e.created_at, e.updated_at,
                (e.poster_path IS NOT NULL) AS has_poster,
                EXISTS (SELECT 1 FROM episode_files ef WHERE ef.episode_id = e.id) AS has_video,
                (SELECT GROUP_CONCAT(quality, ',') FROM
                    (SELECT quality FROM episode_files
                     WHERE episode_id = e.id
                     ORDER BY CASE quality WHEN '1080p' THEN 0 WHEN '720p' THEN 1
                         WHEN '480p' THEN 2 WHEN '360p' THEN 3 ELSE 4 END)
                ) AS available_qualities
         FROM episodes e
         WHERE e.season_id = ? AND e.status = 'published'
         ORDER BY e.episode_number ASC"
    );

    foreach ($seasons as &$season) {
        $episodesQuery->execute([(int)$season['id']]);
        $season['episodes'] = $episodesQuery->fetchAll(PDO::FETCH_ASSOC);
        foreach ($season['episodes'] as &$episode) {
            $episode['has_poster'] = (bool)$episode['has_poster'];
            $episode['has_video'] = (bool)$episode['has_video'];
            $episode['qualities'] = $episode['available_qualities'] === null || $episode['available_qualities'] === ''
                ? []
                : explode(',', $episode['available_qualities']);
            unset($episode['available_qualities']);
        }
        unset($episode);
    }
    unset($season);

    $series['has_poster'] = (bool)$series['has_poster'];
    $series['seasons'] = $seasons;
    return $series;
}
