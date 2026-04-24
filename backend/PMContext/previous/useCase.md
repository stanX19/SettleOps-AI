**System Components:**

* IngestTaggingAgent
* GraphWorkflow(agentic)
* ValidationLoop(Plan,Execute,Validate,Replan)forEachAgenticAgent
* UserErrorHandling(MessageOnMissingDoc/Error)
* FinalCouncil(FinalVerdict)
* FinalReportWriting

**Input:**

**(1) Photographs of car showing damage & plate number:** (Gambar kereta menunjukkan kerosakan dan nombor plat)
**(2) Close-up photograph showing extent of damage:** (Gambar dekat bagi kerosakan)
**(3) A copy of driver's licence:** (Salinan fotostat lesen pemandu)
**(4) Photocopy road tax disc/Registration Card:** (Salinan fotostat Cukai Jalan/Kad Pendaftaran)
**(5) Photocopy of both insured's & driver's NRIC:** (Salinan fotostat K.P pihak Dilinsuranskan & Pemandu)
**(6) Photocopy policy / covernote:** (Salinan fotostat polisi / Nota Perlindungan)
**(7) Police report (certified true copy):** (Laporan Polis (salinan yang diauki benar))
**(8) Workshop quotation:** (Sebut harga Bengkel)

**Optional Input:**

* AdjusterReport(ifrequestedbyworkfloworalreadyattachedfromstart)

**Required Output:**

* ClaimDecisionReport
* AuditableAITrail
