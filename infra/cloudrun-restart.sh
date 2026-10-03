#!/usr/bin/env bash
IMAGE=$(gcloud run services describe llm-summarizer-backend --format="value(spec.template.spec.containers[0].image)")
echo $IMAGE
gcloud run deploy llm-summarizer-backend --image $IMAGE --update-env-vars DUMMY=$(date +%s)
