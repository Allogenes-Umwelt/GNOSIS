"""AUTOGENES — the evidence-graph substrate of GNOSIS.

Python port of the KARELEN substrate (see ref_karelen/ for the frozen
specification). tipos.py holds the domain schemas; sustrato.py is the
ONLY module that mutates the ag_* tables and enforces the provenance
law. Everything scopes to one processing_session (the "application").
"""
