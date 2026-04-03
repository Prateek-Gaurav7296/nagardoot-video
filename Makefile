.PHONY: venv
venv:
	cd server && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt

# After placing weights at server/models/yolov10s.pt:
# make infer SESSION=received/session_123.zip
.PHONY: infer
infer:
	cd server && .venv/bin/python run_pothole_inference.py $(SESSION)
