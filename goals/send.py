# seals a week's plan to the goals page's public key and adds it to inbox.json
# usage: python3 goals/send.py plan.json
import base64, json, os, sys, datetime
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

here = os.path.dirname(os.path.abspath(__file__))
plan = json.load(open(sys.argv[1]))

week = datetime.date.fromisoformat(plan["week"])
if week.weekday() != 0:
    sys.exit(f"week should be a monday, {plan['week']} isn't")
for p in plan["projects"]:
    assert p["name"] and isinstance(p["tasks"], list), "each project needs a name and a list of tasks"

pub = serialization.load_der_public_key(base64.b64decode(open(os.path.join(here, "inbox.pub")).read().strip()))
aes = AESGCM.generate_key(bit_length=256)
iv = os.urandom(12)
ct = AESGCM(aes).encrypt(iv, json.dumps(plan).encode(), None)
k = pub.encrypt(aes, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
b = lambda x: base64.b64encode(x).decode()

path = os.path.join(here, "inbox.json")
box = json.load(open(path)) if os.path.exists(path) else {"v": 1, "weeks": []}
box["weeks"] = [w for w in box["weeks"] if w["week"] != plan["week"]]
box["weeks"].append({"week": plan["week"], "k": b(k), "iv": b(iv), "ct": b(ct)})
box["weeks"] = sorted(box["weeks"], key=lambda w: w["week"])[-6:]
json.dump(box, open(path, "w"))
open(path, "a").write("\n")
print(f"sealed {sum(len(p['tasks']) for p in plan['projects'])} tasks for the week of {plan['week']}")
