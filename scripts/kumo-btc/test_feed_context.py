import copy
import unittest

import feed_context as feeds
from pilot import HOUR, iso, prepare, stamp
from test_pilot import dataset


def record(data, key="news:one", kind="news", entity=feeds.BTC, offset=-60, expires=3600, **extra):
    cutoff = stamp(data["forecasts"][0]["issued_at"])
    return {"id": key, "kind": kind, "entity_id": entity, "asset_class": "crypto",
            "source": "Publisher", "source_url": "https://example.com/" + key,
            "event_at": iso(cutoff + offset - 60), "available_at": iso(cutoff + offset),
            "expires_at": iso(cutoff + expires), "text": "Bitcoin exchange reports new institutional demand",
            "values": {}, "categories": {"ticker": "BTC"}, "related_ids": [], **extra}


def context(data, records):
    return {"schema_version": "kumo-context-v1", "until": data["generated_at"], "records": records,
            "coverage": {kind: {"status": "ready", "truncated": False} for kind in feeds.KINDS}}


class FeedContextTests(unittest.TestCase):
    def test_late_records_and_expired_readings_are_excluded(self):
        data = dataset()
        rows = [record(data), record(data, "late", offset=1), record(data, "expired", kind="funding", expires=-1)]
        examples = prepare(data)[0]
        feeds.attach(examples, context(data, rows), data)
        self.assertEqual([r["id"] for r in examples[0]["context"]["news"]], ["news:one"])
        self.assertEqual(examples[0]["context"]["funding"], [])
        self.assertEqual(examples[0]["extra_features"]["ctx_funding_present"], 0)

    def test_only_the_revision_known_at_the_cutoff_is_selected(self):
        data = dataset()
        rows = [record(data, "old", kind="interpretation", offset=-120, categories={"event_id": "event"}),
                record(data, "new", kind="interpretation", offset=1, categories={"event_id": "event"})]
        examples = prepare(data)[0]
        feeds.attach(examples, context(data, rows), data)
        self.assertEqual([r["id"] for r in examples[0]["context"]["interpretation"]], ["old"])

    def test_btc_and_cross_asset_news_share_context_without_duplicate_urls(self):
        data = dataset()
        rows = [record(data), record(data, "eth", entity="eth", categories={"ticker": "ETH"}),
                record(data, "equity", entity="equity", asset_class="equity"),
                record(data, "repeat", entity="other", source_url="https://example.com/news:one", offset=-90)]
        examples = prepare(data)[0]
        feeds.attach(examples, context(data, rows), data)
        self.assertEqual({r["entity_id"] for r in examples[0]["context"]["news"]}, {feeds.BTC, "eth", "equity"})

    def test_target_changes_cannot_change_context_or_features(self):
        first = dataset()
        other = copy.deepcopy(first)
        other["forecasts"][0]["target_price_usd"] = 100.1
        one, two = prepare(first)[0], prepare(other)[0]
        shared = context(first, [record(first)])
        feeds.attach(one, shared, first)
        feeds.attach(two, shared, other)
        self.assertEqual(one[0]["context"], two[0]["context"])
        self.assertEqual(one[0]["extra_features"], two[0]["extra_features"])
        self.assertNotEqual(one[0]["label"], two[0]["label"])

    def test_invalid_numbers_duplicate_ids_and_target_features_fail(self):
        data = dataset()
        for rows in ([record(data), record(data)],
                     [record(data, values={"volume": float("nan")})],
                     [record(data, values={"target_price_usd": 100})],
                     [record(data, event_at=iso(stamp(data["generated_at"]) + 1))]):
            with self.assertRaises(ValueError):
                feeds.attach(prepare(data)[0], context(data, rows), data)

    def test_graph_entities_are_distinct_per_forecast_and_schema_freezes_before_holdout(self):
        data = dataset()
        examples = prepare(data)[0]
        feeds.attach(examples, context(data, [record(data)]), data)
        second = copy.deepcopy(examples[0])
        second["id"] = "later-hour"
        second["context"]["funding"] = [dict(second["context"]["news"][0], kind="funding")]
        specs = feeds.table_specs(examples)
        entities, tables = feeds.graph_rows(examples + [second], specs)
        self.assertEqual(len(entities), 2)
        self.assertNotEqual(entities[0]["entity_key"], entities[1]["entity_key"])
        self.assertNotIn("funding", tables)
        self.assertTrue(specs["news"]["text"])
        self.assertEqual({r["hour_id"] for r in tables["news"]}, {examples[0]["id"], "later-hour"})

    def test_longer_btc_headline_history_survives_the_catalog_export_cap(self):
        data = dataset()
        cutoff = stamp(data["forecasts"][0]["issued_at"])
        data["news"] = [{"id": "longer", "source": "P", "title": "Bitcoin adoption grows",
                         "url": "https://example.com/longer", "published_at": iso(cutoff - 120),
                         "first_indexed_at": iso(cutoff - 60)}]
        examples = prepare(data)[0]
        feeds.attach(examples, context(data, []), data)
        self.assertEqual(examples[0]["context"]["news"][0]["text"], "Bitcoin adoption grows")


if __name__ == "__main__":
    unittest.main()
