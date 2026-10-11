from pathlib import Path
import json,hashlib,argparse
import pandas as pd
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Rebuild the pinned browser dataset from upstream files.')
parser.add_argument('--raw-dir',type=Path,required=True,help='Directory containing Completeness_783.csv and Connectivity_783.parquet')
parser.add_argument('--annotations',type=Path,required=True,help='Archived 2024 annotation TSV')
parser.add_argument('--output',type=Path,default=ROOT/'public/data')
args=parser.parse_args();RAW=args.raw_dir;OUT=args.output
spec=json.loads((ROOT/'data/manifest.json').read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
if digest(RAW/'Connectivity_783.parquet')!=spec['sourceHash']: raise ValueError('Connectivity source hash mismatch')
if digest(args.annotations)!=spec['annotationSource']['sha256']: raise ValueError('Annotation source hash mismatch')
OUT.mkdir(parents=True,exist_ok=True)
a=pd.read_csv(args.annotations,sep='\t',dtype=str).fillna('').set_index('root_id');ids=pd.read_csv(RAW/'Completeness_783.csv',dtype=str).iloc[:,0].tolist();d=pd.read_parquet(RAW/'Connectivity_783.parquet');n=len(ids);id64=np.array(ids,dtype=np.int64)
pre=d.Presynaptic_Index.to_numpy();post=d.Postsynaptic_Index.to_numpy();assert np.array_equal(id64[pre],d.Presynaptic_ID.to_numpy());assert np.array_equal(id64[post],d.Postsynaptic_ID.to_numpy())
order=np.argsort(pre,kind='stable');pre=pre[order];post=post[order];weights=d['Excitatory x Connectivity'].to_numpy()[order];assert np.abs(weights).sum()<2**31
bins=np.bincount(pre,minlength=n);offsets=np.zeros(n+1,dtype='<u4');offsets[1:]=np.cumsum(bins);offsets.tofile(OUT/'offsets.bin');post.astype('<u4').tofile(OUT/'targets.bin');weights.astype('<i4').tofile(OUT/'weights.bin')
source_inputs={k:set(v) for k,v in json.loads((ROOT/'data/sensory-seeds.json').read_text()).items()}
center=np.array(spec['anatomicalTransform']['centerMicrometres']);scale=spec['anatomicalTransform']['scale'];positions=np.zeros((n,4),dtype='<f4');inputs=np.zeros(n,dtype='<u4');meta={'ids':ids,'labels':[],'classes':[],'transmitters':[],'sides':[]};missing=[]
for i,id in enumerate(ids):
 row=a.loc[id] if id in a.index else None
 if row is not None:
  p=np.array([float(row[c]) for c in ['pos_x','pos_y','pos_z']])*[.004,.004,.04]
  assert np.isfinite(p).all();positions[i,:3]=(p-center)*scale*[1,-1,-1];positions[i,3]=1
  meta['labels'].append(row.cell_type or row.hemibrain_type or row.cell_class or row.super_class);meta['classes'].append(row.cell_class or row.super_class);meta['transmitters'].append(row.top_nt);meta['sides'].append(row.side)
  if row.flow=='afferent' and row.super_class=='sensory' and row.cell_class=='visual':inputs[i]|=4
  if row.flow=='afferent' and row.super_class=='sensory' and row.cell_class=='olfactory':inputs[i]|=8
 else:
  missing.append(id)
  for key in ['labels','classes','transmitters','sides']:meta[key].append('')
 if id in source_inputs['sugar']:inputs[i]|=1
 if id in source_inputs['vibration']:inputs[i]|=2
positions.tofile(OUT/'positions.bin');inputs.tofile(OUT/'inputs.bin');(OUT/'metadata.json').write_text(json.dumps(meta,separators=(',',':'),ensure_ascii=False))
# Check every output against the pinned artifact, including neuron order and IDs.
for name,expected in spec['files'].items():
 p=OUT/name
 if p.stat().st_size!=expected['bytes'] or digest(p)!=expected['sha256']:
  raise ValueError(f'Output mismatch: {name}; check upstream versions and neuron order')
(OUT/'manifest.json').write_text(json.dumps(spec,indent=2)+'\n')
print(f'Verified {n:,} neurons and {len(d):,} directed connection rows')
