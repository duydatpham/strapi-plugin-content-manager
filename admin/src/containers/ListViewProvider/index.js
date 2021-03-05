import React from 'react';
import PropTypes from 'prop-types';

import ListViewContext from '../../contexts/ListView';

function ListViewProvider({ children, ...rest }) {
  console.log('ListViewProvider')
  return (
    <ListViewContext.Provider value={rest}>{children}</ListViewContext.Provider>
  );
}

ListViewProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ListViewProvider;
