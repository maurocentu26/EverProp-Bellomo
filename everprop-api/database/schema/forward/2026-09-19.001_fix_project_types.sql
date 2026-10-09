UPDATE projects 
SET project_type = 'BUILDING' 
WHERE UPPER(name) LIKE '%HUASI%' 
   OR UPPER(name) LIKE '%EDIFICIO%' 
   OR UPPER(name) LIKE '%TORRE%';

UPDATE projects 
SET project_type = 'COMMERCIAL' 
WHERE UPPER(name) LIKE '%GALERIA%' 
   OR UPPER(name) LIKE '%COCHERA%' 
   OR UPPER(name) LIKE '%LOCAL%' 
   OR UPPER(name) LIKE '%NORTE 1%';
