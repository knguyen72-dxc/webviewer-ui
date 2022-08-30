import React, { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { DndProvider } from 'react-dnd';
import { isMobileDevice } from 'helpers/device';
import { HTML5Backend } from 'react-dnd-html5-backend';
import TouchBackEnd from 'react-dnd-touch-backend';
import OutlineControls from '../OutlineControls';
import Outline from 'components/Outline';
import OutlineContext from 'components/Outline/Context';
import Icon from 'components/Icon';
import Button from 'components/Button';
import OutlineTextInput from 'components/OutlineTextInput';
import DataElementWrapper from 'components/DataElementWrapper';
import Events from 'constants/events';

import core from 'core';
import outlineUtils from 'helpers/OutlineUtils';
import DataElements from 'constants/dataElement';
import actions from 'actions';
import selectors from 'selectors';

import '../../constants/bookmarksOutlinesShared.scss';
import './OutlinesPanel.scss';

function OutlinesPanel() {
  const isDisabled = useSelector(state => selectors.isElementDisabled(state, DataElements.OUTLINE_PANEL));
  const isFullPDFEnabled = useSelector(state => selectors.isFullPDFEnabled(state));
  const outlines = useSelector(state => selectors.getOutlines(state));
  const outlineControlVisibility = useSelector(state => selectors.isOutlineControlVisible(state));
  const outlineEditingEnabled = useSelector(state => selectors.getIsOutlineEditing(state));
  const [selectedOutlinePath, setSelectedOutlinePath] = useState(null);
  const [isAddingNewOutline, setIsAddingNewOutline] = useState(false);
  const [isMultiSelectionMode, setMultiSelectionMode] = useState(false);
  const [t] = useTranslation();
  const dispatch = useDispatch();
  const nextPathRef = useRef(null);
  const [bookmarks, setBookmarks] = useState({});

  // use layout effect to avoid flickering in the panel
  useLayoutEffect(() => {
    setIsAddingNewOutline(false);

    if (nextPathRef.current !== null) {
      setSelectedOutlinePath(nextPathRef.current);
      nextPathRef.current = null;
    }
  }, [outlines]);

  useLayoutEffect(() => {

    const updateOutlinePanel = async () => {
      await getBookmarks();
      reRenderPanel();
    };

    core.addEventListener(Events.FORCE_UPDATE_OUTLINES, updateOutlinePanel);

    core.addEventListener(Events.DOCUMENT_LOADED, updateOutlinePanel);

    updateOutlinePanel();

    return () => {
      core.removeEventListener(Events.FORCE_UPDATE_OUTLINES, updateOutlinePanel);

      core.removeEventListener(Events.DOCUMENT_LOADED, updateOutlinePanel);
    };
  }, []);

  function getBookmarkId(title, path) {
    return `${path}-${title}`;
  }

  async function getBookmarks() {
    if (!isFullPDFEnabled) {
      return;
    }

    const doc = core.getDocument();
    const pdfDoc = await doc.getPDFDoc();
    const root = await pdfDoc.getFirstBookmark();
    const queue = [];
    const visited = {};
    
    // Add all the bookmarks in the first level to the queue
    // This includes the root bookmark and all its siblings
    let i = 0;
    let curr = root;

    while (await isValid(curr)) {
      queue.push([curr, `${i}`]);
      curr = await curr.getNext();
      i++;
    }

    while (queue.length > 0) {
      const node = queue.shift();
      const [bookmark, path] = node;

      const titleTask  = bookmark.getTitle();
      const colorTask = bookmark.getColor();
      // Bookmark's flag
      // 1: italic
      // 2: bold
      // 0: normal
      const flagTask = bookmark.getFlags();
      const childrenTask = bookmark.hasChildren();

      const results = await Promise.all([titleTask, colorTask, flagTask, childrenTask]);

      const title = results[0];
      const color = results[1];
      const flag = results[2];
      const hasChildren = results[3];
      const bookmarkId = getBookmarkId(title, path);
      
      visited[bookmarkId] = {
        name: title,
        style : {
          color,
          flag
        }
      };

      if (!hasChildren) {
        continue;
      }

      let childIdx = 0;
      let child = await bookmark.getFirstChild();
      while (await isValid(child)) {
        // The splitter should be the same as the splitter for OutlineId as '-'
        queue.push([child, `${path}-${childIdx}`]);
        child = await child.getNext();
        childIdx++;
      }
    }

    setBookmarks(visited);
  }

  async function isValid(pdfnetOutline) {
    return pdfnetOutline && (await pdfnetOutline.isValid());
  }

  const addNewOutline = async (e) => {
    const name = e.target.value;

    if (!name) {
      setIsAddingNewOutline(false);
      return;
    }

    const currentPage = core.getCurrentPage();
    let nextPath;
    if (outlines.length === 0) {
      nextPath = await outlineUtils.addRootOutline(name, currentPage);
    } else {
      nextPath = await outlineUtils.addNewOutline(name, selectedOutlinePath, currentPage);
    }

    nextPathRef.current = nextPath;
    updateOutlines();
  }

  const updateOutlines = () => {
    core.getOutlines(outlines => {
      dispatch(actions.setOutlines(outlines));
    });
  }

  const generalMoveOutlineAction = (dragOutline, dropOutline, moveDirection) => {
    const dragPath = outlineUtils.getPath(dragOutline);
    const dropPath = outlineUtils.getPath(dropOutline);
    moveDirection.call(outlineUtils, dragPath, dropPath).then(path => {
      updateOutlines();
      nextPathRef.current = path;
    });
    core.goToOutline(dragOutline);
  }

  const moveOutlineAfterTarget = (dragOutline, dropOutline) => {
    generalMoveOutlineAction(dragOutline, dropOutline, outlineUtils.moveOutlineAfterTarget);
  }

  const moveOutlineBeforeTarget = (dragOutline, dropOutline) => {
    generalMoveOutlineAction(dragOutline, dropOutline, outlineUtils.moveOutlineBeforeTarget);
  }

  const moveOutlineInward = (dragOutline, dropOutline) => {
    generalMoveOutlineAction(dragOutline, dropOutline, outlineUtils.moveOutlineInTarget);
  }

  if (isDisabled) {
    return null;
  }

  return (
    <div
      className="Panel OutlinesPanel bookmark-outline-panel"
      data-element={DataElements.OUTLINE_PANEL}
    >
      <div className="bookmark-outline-panel-header">
        <div className="header-title">
          {t('component.outlinesPanel')}
        </div>
      </div>
      <OutlineContext.Provider
        value={{
          setSelectedOutlinePath,
          selectedOutlinePath,
          setIsAddingNewOutline,
          isAddingNewOutline,
          isOutlineSelected: outline => outlineUtils.getPath(outline) === selectedOutlinePath,
          addNewOutline,
          updateOutlines,
        }}
      >
        {outlineControlVisibility && <OutlineControls />}
        <DndProvider backend={isMobileDevice ? TouchBackEnd : HTML5Backend}>
          <div className="Outlines bookmark-outline-row">
            {!isAddingNewOutline && outlines.length === 0 && (
              <div className="msg msg-no-bookmark-outline">{t('message.noOutlines')}</div>
            )}
            {outlines.map(outline => (
              <Outline
                key={outlineUtils.getOutlineId(outline)}
                outline={outline}
                outlineEditingEnabled={outlineEditingEnabled}
                moveOutlineInward={moveOutlineInward}
                moveOutlineBeforeTarget={moveOutlineBeforeTarget}
                moveOutlineAfterTarget={moveOutlineAfterTarget}
                bookmark= {bookmarks ? bookmarks[outlineUtils.getOutlineId(outline)] : null}
                bookmarks = {bookmarks ? bookmarks : null}
              />
            ))}
            {isAddingNewOutline && selectedOutlinePath === null && (
              <OutlineTextInput
                className="marginLeft"
                defaultValue={t('message.untitled')}
                onEnter={addNewOutline}
                onEscape={() => setIsAddingNewOutline(false)}
                onBlur={addNewOutline}
              />
            )}
          </div>
        </DndProvider>
        <DataElementWrapper
          className="bookmark-outline-footer"
          dataElement="addNewOutlineButtonContainer"
        >
          <Button
            dataElement="addNewOutlineButton"
            className="bookmark-outline-control-button add-new-button"
            img="icon-menu-add"
            disabled={isAddingNewOutline || isMultiSelectionMode}
            label={`${t('action.add')} ${t('component.outlinePanel')}`}
            onClick={() => setIsAddingNewOutline(true)}
          />
        </DataElementWrapper>
      </OutlineContext.Provider>
    </div>
  );
}

export default React.memo(OutlinesPanel);
