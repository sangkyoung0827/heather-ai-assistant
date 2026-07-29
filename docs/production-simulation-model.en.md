# Production Simulation Model

`phase9-simulation-1.0.0` uses modified logistic/Monod-inspired growth with temperature, pH, substrate, nitrogen, DO, and excess-substrate terms. Lipid and DHA accumulation are distinct from biomass in the nitrogen-limited stage.

DO is updated from estimated oxygen demand, agitation, aeration, and viscosity-related kLa. Identical profile, input, and random seed produce identical time series. The relative process-risk index is not an observed contamination probability.
