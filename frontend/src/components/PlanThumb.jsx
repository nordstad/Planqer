/*
  A saved plan's own cutting diagram, at thumbnail size — what makes a project
  look like a container with real things in it rather than a list of names.

  Fetched per plan rather than carried in the list payload: the projects
  response deliberately leaves the image out (it is a base64 data URL, and
  forty of them would be megabytes of JSON), so each thumbnail asks for its
  own SVG and owns the object URL it made.
*/

import { useEffect, useState } from 'react';
import { downloadProjectImage } from '../utils/api';

const PlanThumb = ({ project, alt = '' }) => {
  const [url, setUrl] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setUrl(null);
    setMissing(false);

    if (!(project.has_svg_image || project.cutlist_image)) {
      setMissing(true);
      return undefined;
    }

    let objectUrl;
    let live = true;

    downloadProjectImage(project.id, project.projectType)
      .then((blob) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (live) setMissing(true);
      });

    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [project.id, project.projectType, project.has_svg_image, project.cutlist_image]);

  // No branch for "loading": the empty frame is the plate-paper fill behind
  // every state, so an arriving diagram fades onto it instead of replacing a
  // spinner that was never part of the plan.
  return (
    <span className="thumb">
      {url && <img className="thumb-img" src={url} alt={alt} />}
      {missing && <span className="thumb-none">No diagram saved</span>}
    </span>
  );
};

export default PlanThumb;
