# AI Radar

AI Radar is the open, bilingual map of global AI: an event-first information radar, long-term library and cited discovery system for people who build, research, evaluate and create with AI.

## Information and identity

**Source**:
An external publisher or system from which AI Radar receives information, together with its provenance and usage policy.
_Avoid_: Feed, website, channel

**Source Item**:
One record received from one Source, preserving that Source's identity, publication time and provenance. Multiple Source Items may support one Event.
_Avoid_: Article, Event, News

**Event**:
One distinct real-world change or occurrence supported by one or more Source Items. It is the primary unit displayed in Radar.
_Avoid_: Article, Post, Source Item

**Entity**:
A stable, long-lived identity that can accumulate names, versions, Events and Relations over time.
_Avoid_: Record, Page, Item

**Entity Version**:
A specifically identifiable release or state of an Entity, such as a named model version. It must not be collapsed into the broader Entity when version affects facts or comparison.
_Avoid_: Entity, Update

**Relation**:
A typed, directed and evidenced connection between Entities or Events, valid within an explicit time range when applicable.
_Avoid_: Tag, Related item, Association

**Evidence**:
A traceable public basis that supports an Event, Relation, ranking observation or factual assertion.
_Avoid_: Citation text, Confidence

**Topic**:
A curated subject used to connect content across the eight domains without replacing typed Relations.
_Avoid_: Category when referring to a cross-domain subject

## Content domains

**Radar**:
The event-first stream for recent, trending and editorially selected AI changes.
_Avoid_: News page, Feed

**Model**:
An AI model family or identifiable model release whose capabilities, access, pricing and evaluations can change over time.
_Avoid_: Product, API

**Paper**:
A research publication identified by its original publication identity and version history.
_Avoid_: Article, Guide

**Product**:
A user-facing AI service or application maintained by an Organization.
_Avoid_: Model, Repository

**Repository**:
A public source-code project identified by its canonical repository location and license state.
_Avoid_: GitHub when referring to the domain object, Project

**Prompt**:
Authored instructional content intended for a particular task, model or tool, with an explicit source and rights state.
_Avoid_: Guide, Skill

**Skill**:
A versioned capability package for an agent or tool, with explicit compatibility, dependencies, permissions and source.
_Avoid_: Prompt, Plugin, Guide

**Guide**:
Authored instructional material that explains a repeatable AI task, workflow or technique.
_Avoid_: Prompt, News, Paper

## Facts and localization

**Fact Layer**:
The language-independent identity, time, numeric value, status, provenance and relationship data shared by every localization.
_Avoid_: English record, Chinese record

**Localized Content**:
An English or Chinese expression of shared facts, carrying its own authorship, translation method and review state.
_Avoid_: Translation when the content is independently authored

**Localization Status**:
The declared state of Localized Content, such as AI draft, human reviewed, human authored or stale.
_Avoid_: Published status

**Daily Brief**:
A dated bilingual editorial synthesis composed from already published Events, with an explicit data cutoff.
_Avoid_: Newsletter when referring to the content object

## Ranking and editorial selection

**Latest**:
A time-ordered view of eligible records using their actual occurrence, publication or release time.
_Avoid_: Trending, Important

**Trending**:
A method-versioned observation of abnormal attention growth within a declared source-normalized time window.
_Avoid_: Popular, Best, Latest

**Featured**:
An explicit editorial selection with a reason, audience, selection time and commercial disclosure.
_Avoid_: Trending, Sponsored, Best

**Ranking Definition**:
The versioned question, eligibility rules, window, dimensions and limitations of one ranking.
_Avoid_: Leaderboard when the method is unspecified

**Ranking Observation**:
One time-bound result for one eligible object under one Ranking Definition, including evidence and confidence.
_Avoid_: Permanent score, Entity property

**Benchmark Run**:
A result for an exact model version under a specified benchmark version, task, settings, evaluator and date.
_Avoid_: Model score

**Price Record**:
A sourced price with explicit unit, currency, region and period of validity.
_Avoid_: Current price when no validity period is known

**Insufficient Evidence**:
A valid published outcome indicating that available records cannot support a requested comparison, ranking or recommendation.
_Avoid_: Unknown winner, Estimated rank

## Discovery

**Search**:
Deterministic retrieval over public AI Radar records using text, aliases, filters and declared ranking options without generating an answer.
_Avoid_: Ask, Agent

**Ask**:
Cited synthesis generated only from the public, versioned AI Radar dataset and permitted to abstain when evidence is insufficient.
_Avoid_: Search, Web search, General assistant

**Citation**:
A reference from an Ask claim to a public AI Radar record and its original Evidence.
_Avoid_: Bare external URL

**Data Cutoff**:
The latest included data time for an Ask answer, Daily Brief, ranking observation or release.
_Avoid_: Generated time

## Rights, correction and release

**Rights Status**:
The record-level decision that determines how content may be stored, displayed and exported, independently of whether its Source is publicly accessible.
_Avoid_: License when no license exists, Public status

**Public Record**:
A rights-cleared, privacy-cleared projection of an internal record suitable for public pages, Search, Ask, API or a data release.
_Avoid_: Production record

**Correction**:
A published, traceable amendment to a previously public factual record.
_Avoid_: Silent edit, Tombstone

**Tombstone**:
A minimal durable record explaining that a stable public identity was merged, withdrawn or can no longer be distributed.
_Avoid_: Deletion, Correction

**Data Version**:
The declared version of the public dataset used by an API response, Ask answer or frozen release.
_Avoid_: Application version, Database migration version

**Data Release**:
A frozen, validated and checksummed distribution of Public Records with its schema, attribution, Corrections and Tombstones.
_Avoid_: Database backup, Production export
