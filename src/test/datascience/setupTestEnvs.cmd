REM This only works on windows at the moment
python -m venv .venvnoreg

python -m venv .venvkernel
call .venvkernel\Scripts\activate
python -m pip install ipykernel
python -m ipykernel install --user --name .venvkernel --display-name .venvkernel
python -m pip uninstall jedi --yes
python -m pip install jedi==0.17.2

python -m venv .venvnokernel
call .venvnokernel\Scripts\activate
python -m pip install ipykernel
python -m ipykernel install --user --name .venvnokernel --display-name .venvnokernel
python -m pip uninstall jedi --yes
python -m pip install jedi==0.17.2
python -m pip uninstall ipykernel --yes
