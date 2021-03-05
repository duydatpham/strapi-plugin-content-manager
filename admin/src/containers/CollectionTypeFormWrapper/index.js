import { memo, useCallback, useEffect, useMemo, useRef, useReducer } from 'react';
import { useHistory } from 'react-router-dom';
import { get } from 'lodash';
import { request, useGlobalContext } from 'strapi-helper-plugin';
import PropTypes from 'prop-types';
import {
  createDefaultForm,
  formatComponentData,
  getTrad,
  removePasswordFieldsFromData,
  removeFieldsFromClonedData,
} from '../../utils';
import pluginId from '../../pluginId';
import { crudInitialState, crudReducer } from '../../sharedReducers';
import { getRequestUrl } from './utils';

// This container is used to handle the CRUD
const CollectionTypeFormWrapper = ({ allLayoutData, children, from, slug, id, origin }) => {
  const { emitEvent } = useGlobalContext();
  const { push, replace } = useHistory();

  const [
    { componentsDataStructure, contentTypeDataStructure, data, isLoading, status, isReload },
    dispatch,
  ] = useReducer(crudReducer, crudInitialState);
  const emitEventRef = useRef(emitEvent);

  const isCreatingEntry = id === 'create';

  const requestURL = useMemo(() => {
    if (isCreatingEntry && !origin) {
      return null;
    }

    return getRequestUrl(`${slug}/${origin || id}`);
  }, [slug, id, isCreatingEntry, origin]);

  const cleanClonedData = useCallback(
    data => {
      if (!origin) {
        return data;
      }

      const cleaned = removeFieldsFromClonedData(
        data,
        allLayoutData.contentType,
        allLayoutData.components
      );

      return cleaned;
    },
    [allLayoutData, origin]
  );

  const cleanReceivedData = useCallback(
    data => {
      const cleaned = removePasswordFieldsFromData(
        data,
        allLayoutData.contentType,
        allLayoutData.components
      );

      return formatComponentData(cleaned, allLayoutData.contentType, allLayoutData.components);
    },
    [allLayoutData]
  );

  // SET THE DEFAULT LAYOUT the effect is applied when the slug changes
  useEffect(() => {
    const componentsDataStructure = Object.keys(allLayoutData.components).reduce((acc, current) => {
      const defaultComponentForm = createDefaultForm(
        get(allLayoutData, ['components', current, 'attributes'], {}),
        allLayoutData.components
      );

      acc[current] = formatComponentData(
        defaultComponentForm,
        allLayoutData.components[current],
        allLayoutData.components
      );

      return acc;
    }, {});

    const contentTypeDataStructure = createDefaultForm(
      allLayoutData.contentType.attributes,
      allLayoutData.components
    );

    dispatch({
      type: 'SET_DATA_STRUCTURES',
      componentsDataStructure,
      contentTypeDataStructure: formatComponentData(
        contentTypeDataStructure,
        allLayoutData.contentType,
        allLayoutData.components
      ),
    });
  }, [allLayoutData]);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    const getData = async signal => {
      dispatch({ type: 'GET_DATA' });

      try {
        const data = await request(requestURL, { method: 'GET', signal });



        let _entity = {}

        Object.keys(data).forEach(key => {
          if (_.has(data, `${key}.count`)) {
            _entity[`___${key}_count`] = data[key].count || 0
            _entity[key] = [];
          } else {
            _entity[key] = data[key]
          }
        })


        dispatch({
          type: 'GET_DATA_SUCCEEDED',
          data: cleanReceivedData(cleanClonedData(_entity)),
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }

        console.error(err);

        const resStatus = get(err, 'response.status', null);

        if (resStatus === 404) {
          push(from);

          return;
        }

        // Not allowed to read a document
        if (resStatus === 403) {
          strapi.notification.info(getTrad('permissions.not-allowed.update'));

          push(from);
        }
      }
    };

    if (requestURL) {
      getData(signal);
    } else {
      dispatch({ type: 'INIT_FORM' });
    }

    return () => {
      abortController.abort();
    };
  }, [requestURL, push, from, cleanReceivedData, cleanClonedData]);

  const displayErrors = useCallback(err => {
    const errorPayload = err.response.payload;
    console.error(errorPayload);

    let errorMessage = get(errorPayload, ['message'], 'Bad Request');

    // TODO handle errors correctly when back-end ready
    if (Array.isArray(errorMessage)) {
      errorMessage = get(errorMessage, ['0', 'messages', '0', 'id']);
    }

    if (typeof errorMessage === 'string') {
      strapi.notification.error(errorMessage);
    }
  }, []);

  const onDelete = useCallback(
    async trackerProperty => {
      try {
        emitEventRef.current('willDeleteEntry', trackerProperty);

        const response = await request(getRequestUrl(`${slug}/${id}`), {
          method: 'DELETE',
        });

        strapi.notification.success(getTrad('success.record.delete'));

        emitEventRef.current('didDeleteEntry', trackerProperty);

        return Promise.resolve(response);
      } catch (err) {
        emitEventRef.current('didNotDeleteEntry', { error: err, ...trackerProperty });

        return Promise.reject(err);
      }
    },
    [id, slug]
  );

  const onDeleteSucceeded = useCallback(() => {
    replace(from);
  }, [from, replace]);

  const onPost = useCallback(
    async (body, trackerProperty) => {
      const endPoint = getRequestUrl(slug);

      try {
        // Show a loading button in the EditView/Header.js && lock the app => no navigation
        dispatch({ type: 'SET_STATUS', status: 'submit-pending' });

        const response = await request(endPoint, { method: 'POST', body });

        emitEventRef.current('didCreateEntry', trackerProperty);
        strapi.notification.toggle({
          type: 'success',
          message: { id: getTrad('success.record.save') },
        });
        let data = cleanReceivedData(response)
        dispatch({ type: 'SUBMIT_SUCCEEDED', data });
        // Enable navigation and remove loaders
        dispatch({ type: 'SET_STATUS', status: 'resolved' });


        setTimeout(() => {
          window.location.reload()
        }, 500);

        replace(`/plugins/${pluginId}/collectionType/${slug}/${response.id}`);
      } catch (err) {
        emitEventRef.current('didNotCreateEntry', { error: err, trackerProperty });
        displayErrors(err);
        dispatch({ type: 'SET_STATUS', status: 'resolved' });
      }
    },
    [cleanReceivedData, displayErrors, replace, slug]
  );

  const onPublish = useCallback(async () => {
    try {
      emitEventRef.current('willPublishEntry');
      const endPoint = getRequestUrl(`${slug}/${id}/actions/publish`);

      dispatch({ type: 'SET_STATUS', status: 'publish-pending' });

      const response = await request(endPoint, { method: 'POST' });

      emitEventRef.current('didPublishEntry');

      let data = cleanReceivedData(response);
      dispatch({ type: 'SUBMIT_SUCCEEDED', data });
      dispatch({ type: 'SET_STATUS', status: 'resolved' });


      setTimeout(() => {
        window.location.reload()
      }, 500);

      strapi.notification.toggle({
        type: 'success',
        message: { id: getTrad('success.record.publish') },
      });
    } catch (err) {
      displayErrors(err);
      dispatch({ type: 'SET_STATUS', status: 'resolved' });
    }
  }, [cleanReceivedData, displayErrors, id, slug]);

  const onPut = useCallback(
    async (body, trackerProperty) => {
      const endPoint = getRequestUrl(`${slug}/${id}`);

      try {
        emitEventRef.current('willEditEntry', trackerProperty);

        dispatch({ type: 'SET_STATUS', status: 'submit-pending' });

        const response = await request(endPoint, { method: 'PUT', body });

        emitEventRef.current('didEditEntry', { trackerProperty });
        strapi.notification.toggle({
          type: 'success',
          message: { id: getTrad('success.record.save') },
        });
        console.log('response', response)

        let data = cleanReceivedData(response)

        dispatch({ type: 'SUBMIT_SUCCEEDED', data });
        dispatch({ type: 'SET_STATUS', status: 'resolved' });

        setTimeout(() => {
          window.location.reload()
        }, 500);
      } catch (err) {
        emitEventRef.current('didNotEditEntry', { error: err, trackerProperty });
        displayErrors(err);
        dispatch({ type: 'SET_STATUS', status: 'resolved' });
      }
    },
    [cleanReceivedData, displayErrors, slug, id]
  );

  const onUnpublish = useCallback(async () => {
    const endPoint = getRequestUrl(`${slug}/${id}/actions/unpublish`);

    dispatch({ type: 'SET_STATUS', status: 'unpublish-pending' });

    try {
      emitEventRef.current('willUnpublishEntry');

      const response = await request(endPoint, { method: 'POST' });

      emitEventRef.current('didUnpublishEntry');
      strapi.notification.success(getTrad('success.record.unpublish'));

      let data = cleanReceivedData(response);
      dispatch({ type: 'SUBMIT_SUCCEEDED', data });
      dispatch({ type: 'SET_STATUS', status: 'resolved' });

      setTimeout(() => {
        window.location.reload()
      }, 500);
    } catch (err) {
      dispatch({ type: 'SET_STATUS', status: 'resolved' });
      displayErrors(err);
    }
  }, [cleanReceivedData, displayErrors, id, slug]);

  return children({
    componentsDataStructure,
    contentTypeDataStructure,
    data,
    isCreatingEntry,
    isLoadingForData: isLoading,
    onDelete,
    onDeleteSucceeded,
    onPost,
    onPublish,
    onPut,
    onUnpublish,
    status,
    isReload
  });
};

CollectionTypeFormWrapper.defaultProps = {
  from: '/',
  origin: null,
};

CollectionTypeFormWrapper.propTypes = {
  allLayoutData: PropTypes.exact({
    components: PropTypes.object.isRequired,
    contentType: PropTypes.exact({
      apiID: PropTypes.string.isRequired,
      attributes: PropTypes.object.isRequired,
      info: PropTypes.object.isRequired,
      isDisplayed: PropTypes.bool.isRequired,
      kind: PropTypes.string.isRequired,
      layouts: PropTypes.object.isRequired,
      metadatas: PropTypes.object.isRequired,
      options: PropTypes.object.isRequired,
      settings: PropTypes.object.isRequired,
      uid: PropTypes.string.isRequired,
    }).isRequired,
  }).isRequired,
  children: PropTypes.func.isRequired,
  from: PropTypes.string,
  id: PropTypes.string.isRequired,
  origin: PropTypes.string,
  slug: PropTypes.string.isRequired,
};

export default memo(CollectionTypeFormWrapper);
